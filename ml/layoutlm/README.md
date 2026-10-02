# LayoutLMv3 Invoice Key-Information Extraction (KIE)

This module contains the training pipeline and backend inference integration for fine-tuning **LayoutLMv3** (`microsoft/layoutlmv3-base`) on multimodal invoice documents (text tokens, 2D bounding boxes, and document page images).

---

## 🚀 Quick Links & Colab Training

| Resource | Description | Link |
| :--- | :--- | :--- |
| **Colab Training Notebook** | End-to-end fine-tuning on T4 GPU with mixed precision (fp16) | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/akshit/InvoiceGuard/blob/feat/layoutlm-notebook/ml/layoutlm/train_layoutlmv3_invoices.ipynb) |
| **Dataset** | Multi-layout annotated invoice dataset (~2,043 train / 70 val / 125 test) | [`Kwash67/layoutlmv3-invoice-dataset`](https://huggingface.co/datasets/Kwash67/layoutlmv3-invoice-dataset) |
| **Base Model** | Pre-trained multimodal document transformer | [`microsoft/layoutlmv3-base`](https://huggingface.co/microsoft/layoutlmv3-base) |
| **Schema Mapping** | Mapping dataset BIO tags → canonical InvoiceGuard fields | [`label_map.json`](./label_map.json) |

---

## 🏗️ Architecture in InvoiceGuard

In InvoiceGuard's multi-stage pipeline, `LayoutLMv3` operates as an optional neural token classifier inside the **Extractor Chain**:

```
Raw Invoice (PDF / Image)
          │
          ▼
   OCR Engine (Tesseract / docTR / Azure)
   ├─ Words / Tokens
   ├─ Normalized 2D Bounding Boxes [0..1000]
   └─ Page Rendered Image (PIL RGB)
          │
          ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                       EXTRACTOR CHAIN                       │
   │                                                             │
   │  ┌──────────────────────┐     ┌──────────────────────────┐  │
   │  │  HeuristicExtractor  │ ──► │   LayoutLMv3Extractor    │  │
   │  │  (Deterministic/Reg) │     │ (Spatial Token Classif.) │  │
   │  └──────────────────────┘     └──────────────────────────┘  │
   │                 │                          │                │
   │                 └───────────┬──────────────┘                │
   │                             ▼                               │
   │               ┌──────────────────────────┐                  │
   │               │   Optional LLMExtractor  │                  │
   │               │   (Fallback / Low Conf)  │                  │
   │               └──────────────────────────┘                  │
   │                             │                               │
   │                             ▼                               │
   │               ┌──────────────────────────┐                  │
   │               │ Confidence-Weighted Merge│                  │
   │               └──────────────────────────┘                  │
   └─────────────────────────────┬───────────────────────────────┘
                                 ▼
                         Normalizer Service
                     (Dates, Currency, Amounts)
                                 ▼
                        Canonical InvoiceData
```

---

## ⚙️ Backend Service Integration (`backend/app/services/extraction/layoutlm.py`)

### 1. Environment Variables
Configure the model repository in your backend environment (`.env` or production config):

```bash
# Hugging Face Hub Private/Public Model ID
LAYOUTLM_MODEL_ID="kronos070/LayoutLMv3"

# Hugging Face Access Token (required for private repos or gated models)
HF_TOKEN="hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Optional: Local fallback weights directory
LAYOUTLM_LOCAL_DIR="ml/artifacts/layoutlmv3"
```

### 2. Loading the Model & Processor
The backend loader initializes `LayoutLMv3ForTokenClassification` and `LayoutLMv3Processor` in evaluation mode on **CPU**:

```python
import os
import json
import torch
from pathlib import Path
from transformers import LayoutLMv3ForTokenClassification, LayoutLMv3Processor

class LayoutLMv3Extractor:
    def __init__(self, model_id: str = None, token: str = None, label_map_path: str = "ml/layoutlm/label_map.json"):
        self.model_id = model_id or os.getenv("LAYOUTLM_MODEL_ID", "ml/artifacts/layoutlmv3")
        self.token = token or os.getenv("HF_TOKEN")
        self.device = torch.device("cpu") # Fast CPU inference for production backends
        
        # Load label mapping
        with open(label_map_path, "r", encoding="utf-8") as f:
            self.label_map_cfg = json.load(f)
        self.dataset_to_invoiceguard = self.label_map_cfg["dataset_to_invoiceguard"]

        # Load Processor and Model
        print(f"Loading LayoutLMv3 from {self.model_id} on {self.device}...")
        self.processor = LayoutLMv3Processor.from_pretrained(
            self.model_id, 
            apply_ocr=False, 
            token=self.token
        )
        self.model = LayoutLMv3ForTokenClassification.from_pretrained(
            self.model_id, 
            token=self.token
        )
        self.model.to(self.device)
        self.model.eval()
        self.id2label = self.model.config.id2label
```

### 3. CPU Inference & Field Aggregation
LayoutLMv3 classifies tokens. Consecutive `B-<FIELD>` and `I-<FIELD>` tokens are aggregated into complete entity values, calculating union bounding boxes and average confidence:

```python
    @torch.no_grad()
    def extract(self, image, words: list[str], bboxes_1000: list[list[int]], confidence_threshold: float = 0.45):
        """
        Run inference on pre-extracted OCR words and [0..1000] normalized boxes.
        
        Args:
            image: PIL.Image of the invoice page (RGB)
            words: List of OCR word strings
            bboxes_1000: List of [x0, y0, x1, y1] normalized to 0..1000
            confidence_threshold: Minimum average confidence to accept entity
        """
        if not words or not bboxes_1000:
            return {}

        # 1. Prepare encoding with LayoutLMv3Processor (apply_ocr=False)
        encoding = self.processor(
            image,
            words,
            boxes=bboxes_1000,
            truncation=True,
            padding="max_length",
            max_length=512,
            return_tensors="pt"
        )
        
        # Move tensors to device (CPU)
        input_ids = encoding["input_ids"].to(self.device)
        attention_mask = encoding["attention_mask"].to(self.device)
        bbox = encoding["bbox"].to(self.device)
        pixel_values = encoding["pixel_values"].to(self.device)

        # 2. Forward pass
        outputs = self.model(
            input_ids=input_ids,
            attention_mask=attention_mask,
            bbox=bbox,
            pixel_values=pixel_values
        )
        
        # 3. Softmax probabilities and predictions
        probs = torch.softmax(outputs.logits.squeeze(0), dim=-1)
        pred_scores, pred_ids = torch.max(probs, dim=-1)
        
        # 4. Align subtokens back to word pieces
        word_ids = encoding.word_ids(batch_index=0)
        
        entities = []
        current_entity = None

        for idx, word_idx in enumerate(word_ids):
            if word_idx is None:
                continue # Special tokens ([CLS], [SEP], [PAD])
            
            # Use prediction of the first subtoken of each word
            if idx > 0 and word_ids[idx - 1] == word_idx:
                continue

            tag = self.id2label.get(pred_ids[idx].item(), "O")
            score = pred_scores[idx].item()
            word_str = words[word_idx]
            box = bboxes_1000[word_idx]

            if tag.startswith("B-"):
                if current_entity:
                    entities.append(current_entity)
                raw_label = tag[2:]
                current_entity = {
                    "raw_label": raw_label,
                    "tokens": [word_str],
                    "boxes": [box],
                    "scores": [score]
                }
            elif tag.startswith("I-") and current_entity:
                raw_label = tag[2:]
                if raw_label == current_entity["raw_label"]:
                    current_entity["tokens"].append(word_str)
                    current_entity["boxes"].append(box)
                    current_entity["scores"].append(score)
                else:
                    entities.append(current_entity)
                    current_entity = {
                        "raw_label": raw_label,
                        "tokens": [word_str],
                        "boxes": [box],
                        "scores": [score]
                    }
            else:
                if current_entity:
                    entities.append(current_entity)
                    current_entity = None

        if current_entity:
            entities.append(current_entity)

        # 5. Map to canonical InvoiceGuard schema and aggregate
        results = {}
        for ent in entities:
            raw_label = ent["raw_label"]
            schema_field = self.dataset_to_invoiceguard.get(raw_label)
            if not schema_field:
                continue
            
            avg_score = sum(ent["scores"]) / len(ent["scores"])
            if avg_score < confidence_threshold:
                continue

            field_text = " ".join(ent["tokens"]).strip()
            # Bounding box union [min_x0, min_y0, max_x1, max_y1]
            union_box = [
                min(b[0] for b in ent["boxes"]),
                min(b[1] for b in ent["boxes"]),
                max(b[2] for b in ent["boxes"]),
                max(b[3] for b in ent["boxes"])
            ]
            
            # Higher confidence prediction wins if multiple spans exist
            if schema_field not in results or avg_score > results[schema_field]["confidence"]:
                results[schema_field] = {
                    "value": field_text,
                    "confidence": round(avg_score, 4),
                    "bbox": union_box,
                    "source": "layoutlmv3"
                }

        return results
```

---

## 🏷️ Entity Label Mapping

The table below describes how dataset BIO labels map to InvoiceGuard canonical fields:

| Dataset Entity Tag | InvoiceGuard Schema Field | Description |
| :--- | :--- | :--- |
| `INVOICE_NO` | `invoice_number` | Primary invoice identifier code / reference |
| `INVOICE_DATE` | `invoice_date` | Issue / billing date |
| `DUE_DATE` | `due_date` | Payment deadline date |
| `SELLER` | `seller` | Vendor / merchant name and corporate identity |
| `CLIENT` | `client` | Buyer / customer entity name |
| `SELLER_TAX_ID` | `seller_tax_id` | Vendor GSTIN / VAT / EIN / Tax ID |
| `CLIENT_TAX_ID` | `client_tax_id` | Buyer GSTIN / VAT / Tax ID |
| `IBAN` | `iban` | Bank account number / IBAN / wire routing |
| `ITEM_DESC` | `item_desc` | Line item description |
| `ITEM_QTY` | `item_qty` | Quantity ordered / billed |
| `ITEM_NET_PRICE` | `item_net_price` | Unit net rate |
| `ITEM_NET_WORTH` | `item_net_worth` | Total net amount for line item |
| `ITEM_VAT` | `item_vat` | Tax / VAT amount per line item |
| `ITEM_GROSS_WORTH` | `item_gross_worth` | Line item total inclusive of tax |
| `SUBTOTAL` / `TOTAL_NET_WORTH` | `subtotal` | Invoice pre-tax sum |
| `TOTAL_VAT` | `total_vat` | Aggregate tax / GST amount |
| `TOTAL_GROSS_WORTH` | `total_gross_worth` | Grand total payable |
| `CURRENCY` | `currency` | Currency symbol / ISO code (e.g. `$`, `€`, `INR`, `USD`) |
| `DISCOUNT` | `discount` | Promotional deduction / discount |
| `SHIPPING` | `shipping` | Freight / delivery charges |
| `PAYMENT_TERMS` | `payment_terms` | Net terms (e.g. Net 30, Due on receipt) |
| `O` | *None* | Non-entity background tokens |

---

## ⚡ Performance & CPU Optimization Tips

1. **Keep batch size = 1 on CPU**: Inference on single invoice pages takes ~120–250ms on modern multi-core x86 CPUs.
2. **Reuse Processor and Tokenizer**: Keep the processor and model in memory as singletons.
3. **Bounding Box Normalization**: Ensure your OCR engine scales bounding boxes with `x_norm = int(1000 * x / width)` and `y_norm = int(1000 * y / height)` before calling the extractor.
4. **Graceful Fallback**: If `LAYOUTLM_MODEL_ID` is not configured or fails to download, the Extractor Chain seamlessly falls back to `HeuristicExtractor` without interrupting user workflows.
