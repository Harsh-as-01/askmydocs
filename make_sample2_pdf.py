# One-off helper: generates sample2.pdf, a second fictional manual used to
# test multi-document citation attribution. Safe to delete after testing.
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

TEXT = """BrewMaster X9 - Espresso Machine Quick Guide

1. Overview
The BrewMaster X9 is a semi-automatic espresso machine with a 15-bar pump, a 1.8 liter removable water tank, and a 58 mm portafilter. It heats up in 25 seconds thanks to its thermojet heating system.

2. Making Espresso
Fill the portafilter with 18 grams of finely ground coffee, tamp evenly, and lock it into the group head. Press the single-shot button for a 30 ml shot or the double-shot button for 60 ml. The ideal extraction time is 25 to 30 seconds.

3. Milk Frothing
The steam wand reaches frothing temperature in 3 seconds. Purge the wand briefly before and after each use. For best microfoam, start with cold milk and keep the wand tip just below the surface until the milk reaches 60 to 65 degrees Celsius.

4. Cleaning
Run a water-only shot after each session. Descale the machine every 3 months using the supplied descaling solution: empty the tank, add one sachet with 1 liter of water, and hold both shot buttons for 5 seconds to start the automatic descaling cycle. The drip tray and water tank are dishwasher safe.

5. Warranty and Support
The BrewMaster X9 includes a 2-year limited warranty covering manufacturing defects. The warranty excludes damage from scale buildup due to skipped descaling. Contact help@brewmaster.example.com for support."""

styles = getSampleStyleSheet()
doc = SimpleDocTemplate("sample2.pdf", pagesize=A4,
                        leftMargin=2 * cm, rightMargin=2 * cm,
                        topMargin=2 * cm, bottomMargin=2 * cm)
story = []
for para in TEXT.split("\n\n"):
    style = styles["Title"] if para.startswith("BrewMaster") else styles["BodyText"]
    story.append(Paragraph(para.replace("\n", "<br/>"), style))
    story.append(Spacer(1, 8))
doc.build(story)
print("sample2.pdf written")
