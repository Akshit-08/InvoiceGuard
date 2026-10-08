"""Realistic Scan Simulation for Document Pipeline and Evaluation.

Simulates physical scanner artifacts:
- Micro-rotation (±1.5 degrees)
- Gaussian noise & ink bleed
- Subtle defocus / lens blur
- JPEG compression artifacts (quality 55-90)
- Non-uniform lighting and shadow gradient
"""

import io
import random
from typing import Optional, Union

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter


class ScanSimulator:
    def __init__(self, seed: Optional[int] = None) -> None:
        if seed is not None:
            random.seed(seed)
            np.random.seed(seed)

    def simulate_scan(
        self,
        image_or_path: Union[Image.Image, str],
        rotation_deg: Optional[float] = None,
        noise_level: float = 0.015,
        blur_radius: float = 0.6,
        jpeg_quality: Optional[int] = None,
        add_shadow: bool = True,
    ) -> Image.Image:
        """Apply scanner degradation effects to a clean digital page image."""
        if isinstance(image_or_path, str):
            img = Image.open(image_or_path).convert("RGB")
        else:
            img = image_or_path.convert("RGB")

        # 1. Subtle rotation (±1.5 degrees) with white background fill
        if rotation_deg is None:
            rotation_deg = random.uniform(-1.5, 1.5)

        if abs(rotation_deg) > 0.1:
            img = img.rotate(
                rotation_deg,
                resample=Image.Resampling.BILINEAR,
                expand=False,
                fillcolor=(255, 255, 255),
            )

        # 2. Defocus / slight lens blur
        if blur_radius > 0:
            actual_blur = random.uniform(0.3, max(0.4, blur_radius))
            img = img.filter(ImageFilter.GaussianBlur(radius=actual_blur))

        # 3. Add shadow gradient across the page (uneven lighting)
        arr = np.array(img, dtype=np.float32)
        h, w, c = arr.shape

        if add_shadow:
            # Create a 2D linear gradient across width and height
            gradient_x = np.linspace(
                random.uniform(0.92, 0.98), random.uniform(1.0, 1.04), w
            )
            gradient_y = np.linspace(
                random.uniform(0.94, 1.0), random.uniform(0.98, 1.02), h
            )
            shadow_mask = np.outer(gradient_y, gradient_x)
            shadow_mask = np.clip(shadow_mask, 0.85, 1.05)[:, :, np.newaxis]
            arr = arr * shadow_mask

        # 4. Add sensor Gaussian noise
        if noise_level > 0:
            noise = np.random.normal(0, noise_level * 255, (h, w, c))
            arr = np.clip(arr + noise, 0, 255)

        processed = Image.fromarray(arr.astype(np.uint8))

        # 5. Contrast and Brightness micro-variations
        contrast = random.uniform(0.95, 1.05)
        processed = ImageEnhance.Contrast(processed).enhance(contrast)

        # 6. JPEG compression artifacts
        if jpeg_quality is None:
            jpeg_quality = random.randint(60, 88)

        buffer = io.BytesIO()
        processed.save(buffer, format="JPEG", quality=jpeg_quality)
        buffer.seek(0)
        return Image.open(buffer).convert("RGB")
