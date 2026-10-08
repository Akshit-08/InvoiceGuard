# Fonts Directory

InvoiceGuard templates use ReportLab's built-in Type 1 vector fonts (Helvetica, Helvetica-Bold, Times-Roman, Courier) for 100% deterministic, cross-platform rendering across Windows, Linux, and macOS without requiring system font installation or platform-dependent GDI/FreeType raster variations.

Additional OFL (Open Font License) TTF fonts (e.g. Roboto, Inter) can be placed in this folder and registered with ReportLab via `pdfmetrics.registerFont(TTFont(...))`.
