from __future__ import annotations

import math
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Tuple

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "artifacts" / "ppt_assets"


@dataclass(frozen=True)
class Palette:
    bg1: Tuple[int, int, int]
    bg2: Tuple[int, int, int]
    panel: Tuple[int, int, int]
    panel_border: Tuple[int, int, int]
    text: Tuple[int, int, int]
    subtext: Tuple[int, int, int]
    blue: Tuple[int, int, int]
    green: Tuple[int, int, int]
    amber: Tuple[int, int, int]
    rose: Tuple[int, int, int]


PALETTE = Palette(
    bg1=(8, 12, 24),
    bg2=(24, 10, 40),
    panel=(15, 23, 42),
    panel_border=(255, 255, 255),
    text=(241, 245, 249),
    subtext=(148, 163, 184),
    blue=(59, 130, 246),
    green=(16, 185, 129),
    amber=(245, 158, 11),
    rose=(244, 63, 94),
)


def _try_font(paths: Iterable[Path], size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in paths:
        try:
            if path.exists():
                return ImageFont.truetype(str(path), size=size)
        except Exception:
            continue
    return ImageFont.load_default()


def load_fonts(*, title: int, heading: int, body: int, small: int):
    win = Path(os.environ.get("WINDIR", r"C:\Windows"))
    font_dir = win / "Fonts"
    # Prefer Segoe UI (Windows default). Fall back gracefully.
    title_font = _try_font(
        [
            font_dir / "seguisb.ttf",  # Segoe UI Semibold
            font_dir / "segoeuib.ttf",
            font_dir / "segoeui.ttf",
        ],
        title,
    )
    heading_font = _try_font(
        [
            font_dir / "segoeuib.ttf",
            font_dir / "seguisb.ttf",
            font_dir / "segoeui.ttf",
        ],
        heading,
    )
    body_font = _try_font(
        [
            font_dir / "segoeui.ttf",
            font_dir / "arial.ttf",
        ],
        body,
    )
    small_font = _try_font(
        [
            font_dir / "segoeui.ttf",
            font_dir / "arial.ttf",
        ],
        small,
    )
    return title_font, heading_font, body_font, small_font


def lerp(a: int, b: int, t: float) -> int:
    return int(round(a + (b - a) * t))


def lerp_rgb(c1: Tuple[int, int, int], c2: Tuple[int, int, int], t: float) -> Tuple[int, int, int]:
    return (lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t))


def radial_gradient(size: Tuple[int, int], *, center: Tuple[float, float], radius: float,
                    inner: Tuple[int, int, int], outer: Tuple[int, int, int]) -> Image.Image:
    w, h = size
    img = Image.new("RGB", (w, h), outer)
    px = img.load()
    cx, cy = center
    for y in range(h):
        for x in range(w):
            dx = (x - cx)
            dy = (y - cy)
            d = math.sqrt(dx * dx + dy * dy)
            t = min(1.0, max(0.0, d / radius))
            px[x, y] = lerp_rgb(inner, outer, t)
    return img


def layered_background(size: Tuple[int, int]) -> Image.Image:
    w, h = size
    base = radial_gradient((w, h), center=(w * 0.25, h * 0.2), radius=w * 0.9, inner=PALETTE.bg2, outer=PALETTE.bg1)
    glow1 = radial_gradient((w, h), center=(w * 0.85, h * 0.35), radius=w * 0.65, inner=(15, 70, 160), outer=(0, 0, 0))
    glow2 = radial_gradient((w, h), center=(w * 0.6, h * 0.9), radius=w * 0.8, inner=(80, 20, 120), outer=(0, 0, 0))
    base = Image.blend(base, glow1, 0.20)
    base = Image.blend(base, glow2, 0.18)
    return base


def rounded_panel(draw: ImageDraw.ImageDraw, box: Tuple[int, int, int, int], *, radius: int,
                  fill: Tuple[int, int, int], border_alpha: int = 22):
    x1, y1, x2, y2 = box
    draw.rounded_rectangle(box, radius=radius, fill=fill)
    # subtle border
    draw.rounded_rectangle(
        (x1, y1, x2, y2),
        radius=radius,
        outline=(PALETTE.panel_border[0], PALETTE.panel_border[1], PALETTE.panel_border[2], border_alpha),
        width=2,
    )


def draw_arrow(draw: ImageDraw.ImageDraw, p1: Tuple[int, int], p2: Tuple[int, int], *, color: Tuple[int, int, int], width: int = 6):
    draw.line([p1, p2], fill=color, width=width)
    # arrow head
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    ang = math.atan2(dy, dx)
    head = 18
    left = (p2[0] - head * math.cos(ang - math.pi / 7), p2[1] - head * math.sin(ang - math.pi / 7))
    right = (p2[0] - head * math.cos(ang + math.pi / 7), p2[1] - head * math.sin(ang + math.pi / 7))
    draw.polygon([p2, left, right], fill=color)


def center_text(draw: ImageDraw.ImageDraw, box: Tuple[int, int, int, int], text: str, font, fill):
    x1, y1, x2, y2 = box
    tw, th = draw.textbbox((0, 0), text, font=font)[2:]
    x = x1 + (x2 - x1 - tw) / 2
    y = y1 + (y2 - y1 - th) / 2
    draw.text((x, y), text, font=font, fill=fill)


def save(img: Image.Image, name: str):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / name
    img.save(path, format="PNG", optimize=True)
    print(f"wrote {path}")


def make_title_bg():
    size = (1920, 1080)
    img = layered_background(size).convert("RGBA")
    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay, "RGBA")

    title_font, heading_font, body_font, small_font = load_fonts(title=78, heading=42, body=28, small=20)

    # Decorative orbs
    for (cx, cy, r, col, a) in [
        (1680, 180, 180, PALETTE.blue, 60),
        (1500, 840, 220, PALETTE.rose, 55),
        (320, 920, 260, PALETTE.green, 35),
    ]:
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(col[0], col[1], col[2], a))

    # Panels
    rounded_panel(d, (120, 160, 1800, 440), radius=42, fill=(15, 23, 42, 190))
    rounded_panel(d, (120, 500, 1080, 920), radius=42, fill=(2, 6, 23, 160))
    rounded_panel(d, (1140, 500, 1800, 920), radius=42, fill=(2, 6, 23, 160))

    d.text((170, 205), "Digital Task Evaluation Portal", font=title_font, fill=PALETTE.text)
    d.text(
        (170, 305),
        "Role-based assignment workflow with submissions, evaluation, dashboards, and optional AI assist.",
        font=body_font,
        fill=PALETTE.subtext,
    )

    # Left callouts
    d.text((170, 560), "Key Roles", font=heading_font, fill=PALETTE.text)
    for i, (label, col) in enumerate([("Admin", PALETTE.blue), ("Evaluator", PALETTE.green), ("Student", PALETTE.amber)]):
        y = 645 + i * 90
        d.rounded_rectangle((170, y, 540, y + 64), radius=22, fill=(col[0], col[1], col[2], 45), outline=(255, 255, 255, 18), width=2)
        d.ellipse((190, y + 16, 222, y + 48), fill=(col[0], col[1], col[2], 200))
        d.text((238, y + 16), label, font=body_font, fill=PALETTE.text)

    # Right callouts
    d.text((1190, 560), "What It Solves", font=heading_font, fill=PALETTE.text)
    bullets = [
        "Centralized task creation & deadlines",
        "Secure submissions with file uploads",
        "Faster review pipeline + audit trail",
        "Dashboards & notifications",
        "Optional AI feedback assistance",
    ]
    for i, line in enumerate(bullets):
        y = 645 + i * 54
        d.ellipse((1190, y + 12, 1204, y + 26), fill=(PALETTE.blue[0], PALETTE.blue[1], PALETTE.blue[2], 220))
        d.text((1220, y), line, font=body_font, fill=PALETTE.text)

    d.text((170, 960), "Viva/Presentation Deck", font=small_font, fill=(203, 213, 225))
    d.text((170, 990), "Generated assets • 16:9 • 1920×1080", font=small_font, fill=(100, 116, 139))

    overlay = overlay.filter(ImageFilter.GaussianBlur(0.2))
    img = Image.alpha_composite(img, overlay)
    save(img, "title_bg.png")


def make_architecture():
    size = (1920, 1080)
    img = layered_background(size).convert("RGBA")
    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay, "RGBA")
    title_font, heading_font, body_font, small_font = load_fonts(title=62, heading=36, body=26, small=18)

    d.text((120, 86), "System Architecture (High Level)", font=title_font, fill=PALETTE.text)
    d.text((120, 160), "Frontend ↔ Backend API ↔ Database + Storage (+ Optional AI)", font=body_font, fill=PALETTE.subtext)

    # Boxes
    boxes = {
        "Frontend\n(Vite + React)": (140, 320, 620, 820),
        "Backend API\n(Express + JWT)": (720, 320, 1200, 820),
        "MongoDB\n(Users/Tasks/Submissions)": (1320, 340, 1780, 520),
        "Uploads\n(File storage)": (1320, 560, 1780, 740),
        "AI Assist\n(Gemini optional)": (1320, 780, 1780, 940),
    }

    rounded_panel(d, boxes["Frontend\n(Vite + React)"], radius=36, fill=(15, 23, 42, 200))
    rounded_panel(d, boxes["Backend API\n(Express + JWT)"], radius=36, fill=(15, 23, 42, 200))

    for k in ["MongoDB\n(Users/Tasks/Submissions)", "Uploads\n(File storage)", "AI Assist\n(Gemini optional)"]:
        rounded_panel(d, boxes[k], radius=30, fill=(2, 6, 23, 170))

    # Titles inside boxes
    center_text(d, boxes["Frontend\n(Vite + React)"], "Frontend\nVite + React\n(HashRouter)", heading_font, PALETTE.text)
    center_text(d, boxes["Backend API\n(Express + JWT)"], "Backend API\nExpress + JWT\nRole-based access", heading_font, PALETTE.text)
    center_text(d, boxes["MongoDB\n(Users/Tasks/Submissions)"], "MongoDB\nUsers • Tasks • Submissions", body_font, PALETTE.text)
    center_text(d, boxes["Uploads\n(File storage)"], "Uploads\nSubmitted files", body_font, PALETTE.text)
    center_text(d, boxes["AI Assist\n(Gemini optional)"], "AI Assist\nFeedback suggestions", body_font, PALETTE.text)

    # Arrows
    draw_arrow(d, (620, 570), (720, 570), color=(PALETTE.blue[0], PALETTE.blue[1], PALETTE.blue[2], 220))
    draw_arrow(d, (720, 650), (620, 650), color=(PALETTE.blue[0], PALETTE.blue[1], PALETTE.blue[2], 140), width=4)
    draw_arrow(d, (1200, 430), (1320, 430), color=(PALETTE.green[0], PALETTE.green[1], PALETTE.green[2], 220))
    draw_arrow(d, (1200, 650), (1320, 650), color=(PALETTE.green[0], PALETTE.green[1], PALETTE.green[2], 220))
    draw_arrow(d, (1200, 860), (1320, 860), color=(PALETTE.amber[0], PALETTE.amber[1], PALETTE.amber[2], 200))

    # Legend
    rounded_panel(d, (140, 880, 1200, 980), radius=28, fill=(15, 23, 42, 170))
    d.text((180, 904), "Data: MongoDB", font=body_font, fill=PALETTE.text)
    d.text((520, 904), "Files: Uploads dir", font=body_font, fill=PALETTE.text)
    d.text((860, 904), "AI: Gemini key enabled", font=body_font, fill=PALETTE.text)

    img = Image.alpha_composite(img, overlay)
    save(img, "architecture.png")


def make_workflow():
    size = (1920, 1080)
    img = layered_background(size).convert("RGBA")
    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay, "RGBA")
    title_font, heading_font, body_font, small_font = load_fonts(title=62, heading=34, body=26, small=18)

    d.text((120, 86), "End-to-End Workflow", font=title_font, fill=PALETTE.text)
    d.text((120, 160), "From task creation to submission, evaluation, and dashboards.", font=body_font, fill=PALETTE.subtext)

    steps = [
        ("Create Task\n(Evaluator)", PALETTE.green),
        ("Assign + Deadline\n(System)", PALETTE.blue),
        ("Submit Work\n(Student)", PALETTE.amber),
        ("Review Queue\n(Evaluator)", PALETTE.blue),
        ("Evaluate + Feedback\n(Optional AI Assist)", PALETTE.green),
        ("Results + Stats\n(Dashboard)", PALETTE.blue),
    ]

    x0, y0 = 140, 340
    w, h = 520, 110
    gap_y = 28

    for i, (label, col) in enumerate(steps):
        y = y0 + i * (h + gap_y)
        box = (x0, y, x0 + w, y + h)
        rounded_panel(d, box, radius=28, fill=(15, 23, 42, 195))
        d.rounded_rectangle((x0 + 18, y + 18, x0 + 54, y + 54), radius=10, fill=(col[0], col[1], col[2], 220))
        d.text((x0 + 78, y + 22), label, font=heading_font, fill=PALETTE.text)
        if i < len(steps) - 1:
            draw_arrow(
                d,
                (x0 + w // 2, y + h),
                (x0 + w // 2, y + h + gap_y - 6),
                color=(255, 255, 255, 80),
                width=5,
            )

    # Side notes
    rounded_panel(d, (820, 320, 1780, 520), radius=34, fill=(2, 6, 23, 165))
    d.text((860, 350), "Auto-zero for missed deadlines", font=heading_font, fill=PALETTE.text)
    d.text((860, 404), "If a student doesn’t submit before deadline, the system sync creates an evaluated submission with 0 marks.", font=body_font, fill=PALETTE.subtext)

    rounded_panel(d, (820, 560, 1780, 760), radius=34, fill=(2, 6, 23, 165))
    d.text((860, 590), "Notifications", font=heading_font, fill=PALETTE.text)
    d.text((860, 644), "Evaluators get alerts for new submissions; students get alerts for new tasks and maintenance events.", font=body_font, fill=PALETTE.subtext)

    rounded_panel(d, (820, 800, 1780, 960), radius=34, fill=(2, 6, 23, 165))
    d.text((860, 830), "Dashboards", font=heading_font, fill=PALETTE.text)
    d.text((860, 884), "Admin: global stats • Evaluator: owned pipeline • Student: personal progress.", font=body_font, fill=PALETTE.subtext)

    img = Image.alpha_composite(img, overlay)
    save(img, "workflow.png")


def make_data_model():
    size = (1920, 1080)
    img = layered_background(size).convert("RGBA")
    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay, "RGBA")
    title_font, heading_font, body_font, small_font = load_fonts(title=62, heading=34, body=24, small=18)

    d.text((120, 86), "Core Data Model (Simplified)", font=title_font, fill=PALETTE.text)
    d.text((120, 160), "MongoDB collections and relationships used across roles.", font=body_font, fill=PALETTE.subtext)

    cards = {
        "User": (160, 320, 720, 720),
        "Task": (820, 320, 1380, 720),
        "Submission": (1480, 320, 1760, 720),
    }

    rounded_panel(d, cards["User"], radius=34, fill=(15, 23, 42, 200))
    rounded_panel(d, cards["Task"], radius=34, fill=(15, 23, 42, 200))
    rounded_panel(d, cards["Submission"], radius=34, fill=(15, 23, 42, 200))

    def card_title(x: int, y: int, text: str, col: Tuple[int, int, int]):
        d.rounded_rectangle((x, y, x + 12, y + 42), radius=6, fill=(col[0], col[1], col[2], 220))
        d.text((x + 26, y), text, font=heading_font, fill=PALETTE.text)

    card_title(200, 360, "User", PALETTE.blue)
    for i, line in enumerate(["name", "email", "role: admin/evaluator/student"]):
        d.text((200, 430 + i * 44), f"• {line}", font=body_font, fill=PALETTE.subtext)

    card_title(860, 360, "Task", PALETTE.green)
    for i, line in enumerate(["title, description", "deadline", "createdBy → User (evaluator)", "rubricSections (optional)"]):
        d.text((860, 430 + i * 44), f"• {line}", font=body_font, fill=PALETTE.subtext)

    card_title(1510, 360, "Submission", PALETTE.amber)
    for i, line in enumerate(["taskId → Task", "student/userId → User", "fileUrl/fileName", "status, marks, feedback", "isAutoZero (missed)"]):
        d.text((1510, 430 + i * 44), f"• {line}", font=body_font, fill=PALETTE.subtext)

    # Relationship arrows
    draw_arrow(d, (720, 520), (820, 520), color=(PALETTE.blue[0], PALETTE.blue[1], PALETTE.blue[2], 200))
    d.text((740, 478), "creates", font=small_font, fill=(203, 213, 225))

    draw_arrow(d, (1380, 520), (1480, 520), color=(PALETTE.green[0], PALETTE.green[1], PALETTE.green[2], 200))
    d.text((1400, 478), "has", font=small_font, fill=(203, 213, 225))

    draw_arrow(d, (1480, 610), (720, 610), color=(PALETTE.amber[0], PALETTE.amber[1], PALETTE.amber[2], 140), width=4)
    d.text((1040, 574), "submitted by", font=small_font, fill=(203, 213, 225))

    # Footer panel
    rounded_panel(d, (160, 780, 1760, 950), radius=34, fill=(2, 6, 23, 155))
    d.text((200, 810), "Notes", font=heading_font, fill=PALETTE.text)
    d.text(
        (200, 862),
        "Submission supports reopening/resubmission, evaluation details, and optional AI report fields.",
        font=body_font,
        fill=PALETTE.subtext,
    )

    img = Image.alpha_composite(img, overlay)
    save(img, "data_model.png")


def make_ai_pipeline():
    size = (1920, 1080)
    img = layered_background(size).convert("RGBA")
    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay, "RGBA")
    title_font, heading_font, body_font, small_font = load_fonts(title=62, heading=34, body=24, small=18)

    d.text((120, 86), "AI Assist (Optional) — Evaluation Support", font=title_font, fill=PALETTE.text)
    d.text((120, 160), "AI suggests marks/feedback; evaluator remains final authority.", font=body_font, fill=PALETTE.subtext)

    nodes = [
        ("Submission\n(file/answer)", 180, 360, PALETTE.blue),
        ("Rubric / Criteria\n(task)", 700, 360, PALETTE.green),
        ("AI Assist\n(Gemini)", 1220, 360, PALETTE.amber),
        ("Suggested\nmarks + feedback", 700, 650, PALETTE.blue),
        ("Final Evaluation\n(saved by evaluator)", 1220, 650, PALETTE.green),
    ]

    boxes = {}
    for label, x, y, col in nodes:
        box = (x, y, x + 520, y + 170)
        boxes[label] = box
        rounded_panel(d, box, radius=34, fill=(15, 23, 42, 195))
        d.rounded_rectangle((x + 22, y + 22, x + 62, y + 62), radius=12, fill=(col[0], col[1], col[2], 220))
        d.text((x + 84, y + 26), label, font=heading_font, fill=PALETTE.text)

    draw_arrow(d, (700, 445), (1220, 445), color=(PALETTE.blue[0], PALETTE.blue[1], PALETTE.blue[2], 200))
    draw_arrow(d, (1220, 530), (960, 650), color=(PALETTE.amber[0], PALETTE.amber[1], PALETTE.amber[2], 200))
    draw_arrow(d, (1220, 735), (1480, 735), color=(PALETTE.green[0], PALETTE.green[1], PALETTE.green[2], 200))

    rounded_panel(d, (180, 860, 1760, 980), radius=34, fill=(2, 6, 23, 155))
    d.text((220, 890), "Guardrails", font=heading_font, fill=PALETTE.text)
    d.text((220, 942), "• AI is optional (enabled via API key)  • Evaluator can edit/override  • Stored with audit timestamps", font=body_font, fill=PALETTE.subtext)

    img = Image.alpha_composite(img, overlay)
    save(img, "ai_pipeline.png")


def main():
    make_title_bg()
    make_architecture()
    make_workflow()
    make_data_model()
    make_ai_pipeline()


if __name__ == "__main__":
    main()

