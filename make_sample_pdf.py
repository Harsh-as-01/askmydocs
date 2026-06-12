# One-off helper: generates sample.pdf, a fictional product manual used to
# test the RAG pipeline. Safe to delete after testing.
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

TEXT = """AuroraDesk Pro - Standing Desk User Manual

1. Product Overview
The AuroraDesk Pro is a dual-motor electric standing desk with a height range of 65 cm to 130 cm. The desktop surface measures 160 cm by 80 cm and supports a maximum load of 120 kg. The frame is made of powder-coated steel and is available in black, white, and walnut finishes.

2. Warranty
The AuroraDesk Pro comes with a 7-year warranty on the frame and motors, and a 2-year warranty on the desktop surface and electronics. The warranty does not cover damage caused by improper assembly, water exposure, or loads exceeding 120 kg. To make a warranty claim, email support@auroradesk.example.com with your order number and photos of the issue. Claims are typically processed within 5 business days.

3. Assembly
Assembly takes approximately 40 minutes and requires two people. The package includes all necessary tools: a 4 mm hex key and a Phillips screwdriver. Important: do not fully tighten any bolts until the entire frame is assembled. The desk ships in two boxes; box 1 contains the frame and motors, box 2 contains the desktop and control panel.

4. Height Presets
The control panel supports four programmable height presets. To save a preset, move the desk to the desired height, then hold the M button for 3 seconds until the display blinks, and press one of the numbered buttons (1-4). To recall a preset, simply press its numbered button. The display shows the current height in centimeters.

5. Anti-Collision System
The desk features a gyroscopic anti-collision system. If the desktop encounters an obstacle while moving, it stops immediately and reverses 3 cm in the opposite direction. Sensitivity can be adjusted to three levels (low, medium, high) by holding the M button and pressing the up arrow. The default sensitivity is medium.

6. Troubleshooting
If the display shows error code E01, the motors are out of sync: lower the desk to its minimum height and hold the down button for 10 seconds to reset. Error code E02 indicates overheating; let the desk rest for 18 minutes before resuming use. The duty cycle is 2 minutes of continuous operation followed by 18 minutes of rest. If the desk does not respond at all, check that the power cable is seated firmly and the outlet works.

7. Care and Maintenance
Clean the desktop with a soft, slightly damp cloth. Do not use abrasive cleaners or solvents. Check and re-tighten the frame bolts every 6 months. Keep the desk away from direct sunlight to prevent the finish from fading. The motors require no lubrication or maintenance.

8. Returns
Unopened desks may be returned within 30 days of delivery for a full refund. Opened desks may be returned within 30 days for a refund minus a 15 percent restocking fee. Return shipping costs are the customer's responsibility unless the return is due to a manufacturing defect."""

styles = getSampleStyleSheet()
doc = SimpleDocTemplate("sample.pdf", pagesize=A4,
                        leftMargin=2 * cm, rightMargin=2 * cm,
                        topMargin=2 * cm, bottomMargin=2 * cm)
story = []
for para in TEXT.split("\n\n"):
    style = styles["Title"] if para.startswith("AuroraDesk") else styles["BodyText"]
    story.append(Paragraph(para.replace("\n", "<br/>"), style))
    story.append(Spacer(1, 8))
doc.build(story)
print("sample.pdf written")
