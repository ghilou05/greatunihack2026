#!/usr/bin/env python3
"""Generate shared/fixtures/golden-demo.pdf, the team's demo lecture notes.

Usage (from anywhere, needs `pip install reportlab`):

    python scripts/make_golden_pdf.py

Then copy the result to frontend/public/documents/golden-demo.pdf for offline
dev. Output is byte-for-byte reproducible, so re-running only changes the file
if this script changed. Changing the text or layout invalidates the span_ids
and pages in the sample index and lesson plan: see shared/fixtures/README.md.
"""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    ListFlowable,
    ListItem,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUTPUT = Path(__file__).resolve().parents[1] / "shared" / "fixtures" / "golden-demo.pdf"
EXPECTED_PAGES = 4

COURSE = "Introductory Cell Biology: Lecture Notes"
CHAPTER = "Chapter 4"
MARGIN = 2.5 * cm
INK = colors.HexColor("#1f2933")
RULE = colors.HexColor("#9aa5b1")
TINT = colors.HexColor("#eef2f6")

BODY = ParagraphStyle(
    "Body",
    fontName="Times-Roman",
    fontSize=11,
    leading=15,
    textColor=INK,
    alignment=TA_JUSTIFY,
    spaceAfter=8,
)
TITLE = ParagraphStyle(
    "Title",
    fontName="Helvetica-Bold",
    fontSize=20,
    leading=25,
    textColor=INK,
    spaceAfter=4,
)
SUBTITLE = ParagraphStyle(
    "Subtitle",
    fontName="Helvetica",
    fontSize=11,
    leading=15,
    textColor=INK,
    spaceAfter=14,
)
HEADING = ParagraphStyle(
    "Heading",
    fontName="Helvetica-Bold",
    fontSize=13,
    leading=17,
    textColor=INK,
    spaceBefore=10,
    spaceAfter=6,
    keepWithNext=1,
)
DEFINITION = ParagraphStyle(
    "Definition",
    parent=BODY,
    alignment=0,
    spaceAfter=0,
)
FORMULA = ParagraphStyle(
    "Formula",
    parent=BODY,
    alignment=0,
    leftIndent=1 * cm,
    spaceAfter=8,
)
BULLET = ParagraphStyle("Bullet", parent=BODY, spaceAfter=3)
CELL = ParagraphStyle("Cell", parent=BODY, fontSize=10, leading=13, alignment=0, spaceAfter=0)
CELL_HEAD = ParagraphStyle("CellHead", parent=CELL, fontName="Times-Bold")
CAPTION = ParagraphStyle("Caption", parent=CELL, fontName="Times-Italic", spaceBefore=6, spaceAfter=10)


def definition(term, text):
    """A boxed, tinted definition block. Single-cell tables never split across pages."""
    box = Table(
        [[Paragraph(f"<b>Definition ({term}).</b> {text}", DEFINITION)]],
        colWidths=[A4[0] - 2 * MARGIN],
    )
    box.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 1, INK),
                ("BACKGROUND", (0, 0), (-1, -1), TINT),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return [Spacer(1, 2), box, Spacer(1, 10)]


def bullets(items):
    return ListFlowable(
        [ListItem(Paragraph(item, BULLET), leftIndent=16) for item in items],
        bulletType="bullet",
        start="•",
        leftIndent=16,
    )


def tonicity_table():
    rows = [
        ["Solution around the cell", "Net water movement", "Animal cell", "Plant cell"],
        ["Hypotonic (e.g. 0.05 M NaCl)", "Into the cell", "Swells and may burst (lysis)", "Becomes firm (turgid)"],
        ["Isotonic (e.g. 0.15 M NaCl)", "No net movement", "Keeps its normal volume", "Becomes limp (flaccid)"],
        ["Hypertonic (e.g. 0.30 M NaCl)", "Out of the cell", "Shrinks (crenation)", "Membrane pulls away from wall (plasmolysis)"],
    ]
    data = [[Paragraph(text, CELL_HEAD if r == 0 else CELL) for text in row] for r, row in enumerate(rows)]
    table = Table(data, colWidths=[4.6 * cm, 3.2 * cm, 4.0 * cm, 4.2 * cm], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.5, RULE),
                ("BACKGROUND", (0, 0), (-1, 0), TINT),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def build_story():
    p = lambda text: Paragraph(text, BODY)
    h = lambda text: Paragraph(text, HEADING)

    return [
        Paragraph("Chapter 4: Cell Membranes and Osmosis", TITLE),
        Paragraph("How a thin, flexible barrier controls what enters a cell, and why water follows solutes", SUBTITLE),
        p(
            "Every living cell has to solve the same problem. It must keep its interior chemically distinct "
            "from its surroundings while still taking in nutrients and getting rid of waste. The structure that "
            "makes this possible is the plasma membrane, a sheet only a few nanometres thick. These notes begin "
            "with how the membrane is built, then look at how substances cross it, and finish with osmosis: the "
            "movement of water that decides whether a cell keeps its shape, swells or shrivels."
        ),
        h("1. Structure of the Plasma Membrane"),
        p(
            "The basic building block of the membrane is the phospholipid. Each molecule has a polar head group, "
            "containing a phosphate, joined through glycerol to two long fatty acid tails. The head interacts "
            "readily with water, whereas the tails avoid it. A molecule with both kinds of region is described as "
            "amphipathic, and this dual character explains almost everything about how membranes assemble."
        ),
        p(
            "When phospholipids are placed in water they arrange themselves spontaneously so that the tails are "
            "shielded and the heads remain in contact with the surrounding liquid. The most stable arrangement for "
            "cell membranes is the bilayer, in which two sheets of phospholipid sit tail to tail. No enzyme or "
            "energy source is needed for this. The bilayer forms because burying the tails lets the nearby water "
            "molecules adopt a more disordered, and therefore more favourable, arrangement. The hydrophobic core "
            "of the finished sheet is what makes it such an effective barrier to charged and polar substances."
        ),
        p(
            "Individual lipids are not fixed in place. They drift rapidly within their own sheet, although flipping "
            "from one sheet to the other is rare without the help of a protein. Singer and Nicolson captured this "
            "picture in 1972 with the fluid mosaic model, which describes proteins dotted through a two-dimensional "
            "fluid of lipid. Fluidity matters because many membrane proteins must move and meet one another in order "
            "to work. It depends on the membrane's composition and its environment in several ways:"
        ),
        bullets(
            [
                "<b>Tail saturation:</b> double bonds put kinks in unsaturated tails, which stops them packing "
                "tightly and so keeps the membrane more fluid.",
                "<b>Tail length:</b> longer tails have more contact with their neighbours, which makes the "
                "membrane less fluid.",
                "<b>Cholesterol:</b> this acts as a buffer, stiffening the membrane at higher temperatures and "
                "preventing tight packing at lower ones.",
                "<b>Temperature:</b> warming increases molecular motion, and so fluidity rises unless the "
                "composition of the membrane changes to compensate.",
            ]
        ),
        Spacer(1, 6),
        p(
            "Lipids form the barrier, but proteins carry out most of the membrane's specific tasks. Integral "
            "proteins are embedded in the bilayer, and many span it completely, while peripheral proteins are "
            "attached more loosely to one surface. Between them they act as transporters, receptors, enzymes and "
            "anchors for the cytoskeleton. On the outer face, short carbohydrate chains attached to lipids and "
            "proteins form a coat known as the glycocalyx, which protects the cell and helps other cells to "
            "recognise it."
        ),
        h("2. Movement Across the Membrane"),
        p(
            "Whether a substance crosses unaided depends largely on its size and polarity. Small nonpolar molecules "
            "such as oxygen and carbon dioxide dissolve in the hydrophobic core and pass through quickly. Small "
            "uncharged polar molecules, including water and urea, cross much more slowly. Larger polar molecules "
            "such as glucose barely cross at all, and ions are almost completely excluded, however small they are, "
            "because their charge and shell of bound water make the lipid interior very unfavourable."
        ),
        p(
            "Simple diffusion is the net movement of a substance from a region of higher concentration to one of "
            "lower concentration, driven only by the random motion of its molecules. For a substance crossing a "
            "membrane, the net flux per unit area is proportional to the concentration difference: "
            "J = P × (C<sub>out</sub> - C<sub>in</sub>), where P is the permeability of the membrane to that "
            "substance. A positive value of J means net movement into the cell. Doubling the difference doubles the "
            "flux, and when the two concentrations are equal the net flux falls to zero, even though individual "
            "molecules continue to cross in both directions."
        ),
        p(
            "Substances that cannot cross the lipid core rely on proteins. Channels provide a water-filled pore "
            "through which particular ions or molecules can pass, and many open only in response to a specific "
            "signal. Carriers bind their passenger and change shape to release it on the other side. Both are forms "
            "of facilitated diffusion: no direct energy input is needed, and movement is always down the "
            "concentration gradient. Facilitated transport differs from simple diffusion in one important way. "
            "Because there is a limited number of carriers, the rate levels off once they are all occupied, a "
            "behaviour known as saturation. Transport of glucose into many body cells follows this pattern."
        ),
        p(
            "Moving a substance against its gradient requires energy. In primary active transport this comes directly "
            "from ATP. The best-known example is the sodium-potassium pump, which moves three Na<super>+</super> ions "
            "out of the cell and two K<super>+</super> ions in for each ATP it hydrolyses. Secondary active "
            "transport uses the gradient created by such a pump as its energy source. The sodium-glucose "
            "cotransporter in the lining of the small intestine, for example, lets sodium run down its gradient and "
            "uses that movement to drag glucose into the cell, even when glucose is already more concentrated inside."
        ),
        h("3. Osmosis and Osmotic Pressure"),
        p(
            "Water deserves separate treatment because it is by far the most abundant molecule on both sides of the "
            "membrane. Some water crosses the bilayer directly, but in many tissues most of it passes through "
            "dedicated channels called aquaporins. Cells in the kidney, for instance, regulate how much water they "
            "reabsorb by changing the number of aquaporins in their membranes."
        ),
        *definition(
            "osmosis",
            "Osmosis is the net movement of water across a selectively permeable membrane, from a solution with a "
            "lower total solute concentration to a solution with a higher total solute concentration.",
        ),
        p(
            "The key point is that water responds to the number of dissolved particles, not to their chemical "
            "identity. This is why chemists use osmolarity, the total concentration of osmotically active particles. "
            "A 1 M glucose solution is about 1 osmol/L, because glucose stays intact in water. A 1 M NaCl solution is "
            "close to 2 osmol/L, because each formula unit separates into one sodium ion and one chloride ion. Human "
            "blood plasma has an osmolarity of roughly 290 mosmol/L."
        ),
        p(
            "Suppose a rigid container is divided by a membrane permeable only to water, with pure water on one side "
            "and a salt solution on the other. Water will move into the salt solution and raise its level until the "
            "extra pressure on that side exactly balances the tendency of water to enter. The pressure needed to stop "
            "net flow is called the osmotic pressure. For a dilute solution it is estimated using the van 't Hoff "
            "equation:"
        ),
        Paragraph("P<sub>osm</sub> = i × M × R × T", FORMULA),
        p(
            "Here i is the number of particles formed per formula unit, M is the molar concentration, R is the gas "
            "constant and T is the absolute temperature. As a worked example, take 0.15 M NaCl at body temperature "
            "(310 K), assuming complete dissociation so that i = 2. Using R = 0.08206 L·atm/(mol·K) gives "
            "2 × 0.15 × 0.08206 × 310, or about 7.6 atm. This is a surprisingly large value, several times atmospheric "
            "pressure, and it shows why an unprotected cell placed in pure water can burst so quickly."
        ),
        h("4. Tonicity and Cell Volume"),
        p(
            "Osmolarity alone does not predict what will happen to a cell, because it counts every particle whether or "
            "not that particle can cross the membrane. A solute that crosses freely soon reaches a similar "
            "concentration on both sides and stops exerting a lasting effect on water movement. To predict changes in "
            "cell volume, we need a measure that counts only the solutes that remain on one side."
        ),
        *definition(
            "tonicity",
            "Tonicity describes the effect of a surrounding solution on the volume of a cell. It depends only on the "
            "concentration of solutes that cannot cross the cell membrane.",
        ),
        p(
            "The three possible cases are summarised in Table 1. Note that the outcome differs between animal and "
            "plant cells. An animal cell has no wall to resist expansion, while a plant cell's rigid wall pushes back "
            "as the cell fills. This turgor pressure is what holds up non-woody stems, and it explains why a plant "
            "wilts when it is short of water."
        ),
        tonicity_table(),
        Paragraph("Table 1. Typical effects of solutions of different tonicity on animal and plant cells.", CAPTION),
        p(
            "Urea shows clearly why the two terms must be kept apart. A 0.3 M urea solution has about the same "
            "osmolarity as the inside of a red blood cell, so it is iso-osmotic. However, urea gradually enters the "
            "cell, and water follows it. The cell swells and eventually bursts, which means that the same solution "
            "is hypotonic even though the total particle counts initially matched."
        ),
        p(
            "The same reasoning applies in medicine. Normal saline (0.9% NaCl) is close to isotonic, so it can be "
            "given into a vein without harming blood cells. In contrast, a 5% glucose solution starts out roughly "
            "iso-osmotic with plasma, but body cells take up and use the glucose, leaving behind water that behaves "
            "as a hypotonic fluid. Many organisms also face this challenge in nature. Freshwater protists such as "
            "<i>Paramecium</i> take in water constantly and survive by pumping it out through contractile vacuoles."
        ),
        p(
            "We can also estimate how large a volume change to expect. If a cell behaves as an ideal osmometer, and "
            "its solutes neither enter nor leave, then the amount of solute inside stays constant and water moves "
            "until the inside and outside concentrations match. Consider a cell containing 300 mosmol/L of trapped "
            "solute that is placed in a solution of 150 mosmol/L of non-penetrating solute. The internal concentration "
            "must halve, and so the cell would need to double its volume. In reality part of a cell's volume is taken "
            "up by proteins and other solids that do not behave in this way, so the calculation is only a first "
            "approximation. A red blood cell would normally burst before it reached this size."
        ),
        p(
            "Animal cells are not passive during these changes. A cell also holds many large, charged molecules, such "
            "as proteins and nucleic acids, that cannot leave. These draw in small ions and water, creating a constant "
            "tendency to swell. The sodium-potassium pump counteracts this by continually removing sodium, and "
            "experiments show that cells gain water and swell when the pump is blocked by a drug such as ouabain. "
            "Cells can respond to shorter-term stress as well. A swollen cell can open potassium and chloride channels "
            "and release small organic molecules, so that water follows these solutes out. This response is known as "
            "regulatory volume decrease. A shrunken cell can do the reverse by taking up ions through cotransporters, "
            "which is called regulatory volume increase."
        ),
        p(
            "Whole organisms have to manage the same physical pressures on a larger scale. A freshwater fish is "
            "hypertonic to its surroundings, so it gains water across its gills and gets rid of the excess by producing "
            "large volumes of dilute urine. A typical marine fish faces the opposite problem. It loses water to the "
            "sea, so it drinks seawater and uses specialised gill cells to pump out the excess salt. In each case, "
            "energy is spent to maintain a steady internal state against a gradient that never goes away."
        ),
        p(
            "To summarise, the lipid bilayer provides a general barrier, proteins provide selective routes through "
            "it, and water follows the distribution of solutes that those proteins establish. Keeping the difference "
            "between osmolarity and tonicity clear will be useful in the next chapter, which considers how the "
            "ion gradients maintained by membrane pumps give rise to electrical signals in nerve cells."
        ),
    ]


def draw_page_furniture(canvas, doc):
    width, height = A4
    canvas.saveState()
    canvas.setFillColor(INK)
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.5)

    header_y = height - 1.6 * cm
    canvas.setFont("Helvetica", 9)
    canvas.drawString(MARGIN, header_y, COURSE)
    canvas.drawRightString(width - MARGIN, header_y, CHAPTER)
    canvas.line(MARGIN, header_y - 5, width - MARGIN, header_y - 5)

    canvas.drawCentredString(width / 2, 1.3 * cm, f"Page {doc.page}")
    canvas.restoreState()


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=2.3 * cm,
        bottomMargin=2.0 * cm,
        title="Chapter 4: Cell Membranes and Osmosis",
        author="GreatUniHack 2026 demo fixture",
        subject=COURSE,
        invariant=1,
    )
    doc.build(build_story(), onFirstPage=draw_page_furniture, onLaterPages=draw_page_furniture)

    if doc.page != EXPECTED_PAGES:
        raise SystemExit(f"Expected {EXPECTED_PAGES} pages but built {doc.page}: adjust the content.")
    print(f"Wrote {OUTPUT} ({doc.page} pages)")


if __name__ == "__main__":
    main()
