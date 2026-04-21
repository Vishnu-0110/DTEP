from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import math, shutil

BASE = Path(__file__).resolve().parents[1]
OUT = BASE / 'docs' / 'figures'
CH3 = OUT / 'chapter3'
CH4 = OUT / 'chapter4'
CH3.mkdir(parents=True, exist_ok=True)
CH4.mkdir(parents=True, exist_ok=True)
W, H = 1920, 1080

COL = {
    'text': (15,23,42), 'muted': (71,85,105), 'stroke': (201,214,233),
    'accent': (37,99,235), 'success': (22,163,74), 'warn': (245,158,11),
    'danger': (225,29,72), 'teal': (13,148,136), 'purple': (124,58,237),
}


def font(size, bold=False):
    paths = [r'C:/Windows/Fonts/segoeui.ttf', r'C:/Windows/Fonts/arial.ttf']
    if bold:
        paths = [r'C:/Windows/Fonts/segoeuib.ttf', r'C:/Windows/Fonts/arialbd.ttf'] + paths
    for p in paths:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

FT = font(42, True)
FH1 = font(30, True)
FH2 = font(24, True)
FB = font(18)
FS = font(15)
FXS = font(13)


def grad(img, top=(242,247,255), bot=(229,239,252)):
    d = ImageDraw.Draw(img)
    for y in range(img.height):
        t = y / max(1, img.height - 1)
        c = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
        d.line([(0, y), (img.width, y)], fill=c)


def rr(d, b, r=18, f=(255,255,255), o=(201,214,233), w=1):
    d.rounded_rectangle(b, radius=r, fill=f, outline=o, width=w)


def wrap(d, txt, fnt, w):
    words = str(txt).split()
    if not words:
        return []
    out, cur = [], words[0]
    for w0 in words[1:]:
        t = cur + ' ' + w0
        if d.textlength(t, font=fnt) <= w:
            cur = t
        else:
            out.append(cur); cur = w0
    out.append(cur)
    return out


def para(d, x, y, w, txt, fnt=FS, fill=(71,85,105), max_lines=4, gap=4):
    lines = wrap(d, txt, fnt, w)[:max_lines]
    if lines and len(wrap(d, txt, fnt, w)) > max_lines:
        lines[-1] = lines[-1] + '...'
    yy = y
    for ln in lines:
        d.text((x, yy), ln, font=fnt, fill=fill)
        yy = d.textbbox((x, yy), ln, font=fnt)[3] + gap


def badge(d, x, y, txt, color):
    tw = int(d.textlength(txt, font=FS))
    b = [x, y, x + tw + 28, y + 34]
    rr(d, b, r=10, f=(255,255,255), o=color, w=2)
    d.text((x + 14, y + 8), txt, font=FS, fill=color)


def arrow(d, a, b, color=(51,65,85), label=None):
    d.line([a, b], fill=color, width=4)
    ang = math.atan2(b[1]-a[1], b[0]-a[0]); L, Wd = 14, 7
    p2 = (b[0]-L*math.cos(ang)+Wd*math.sin(ang), b[1]-L*math.sin(ang)-Wd*math.cos(ang))
    p3 = (b[0]-L*math.cos(ang)-Wd*math.sin(ang), b[1]-L*math.sin(ang)+Wd*math.cos(ang))
    d.polygon([b, p2, p3], fill=color)
    if label:
        mx, my = (a[0]+b[0])//2, (a[1]+b[1])//2
        tb = d.textbbox((mx, my), label, font=FXS)
        rr(d, [tb[0]-6, tb[1]-4, tb[2]+6, tb[3]+4], r=8, f=(255,255,255), o=(203,213,225), w=1)
        d.text((mx, my), label, font=FXS, fill=(30,41,59))


def shell(title, subtitle, role='Admin', accent=(37,99,235)):
    img = Image.new('RGB', (W, H)); grad(img)
    d = ImageDraw.Draw(img)
    rr(d, [42, 36, W-42, H-38], r=28, f=(255,255,255), o=(194,209,228), w=2)
    rr(d, [72, 86, 342, H-86], r=22, f=(13,28,53), o=(21,48,93), w=1)
    d.text((102, 118), 'DTE PORTAL', font=FH2, fill=(226,232,240))
    d.text((102, 152), f'{role} Workspace', font=FS, fill=(148,163,184))
    y = 220
    for i, it in enumerate(['Dashboard','Assignments','Submissions','Users','Notifications','Settings']):
        if i == 0: rr(d, [90, y-8, 322, y+30], r=12, f=(30,58,109), o=(59,130,246), w=1)
        d.text((112, y), it, font=FB, fill=(240,249,255) if i == 0 else (148,163,184)); y += 62
    cx0, cy0, cx1, cy1 = 372, 86, W-72, H-86
    rr(d, [cx0, cy0, cx1, cy1], r=22, f=(247,250,255), o=(218,226,241), w=1)
    rr(d, [cx0+24, cy0+20, cx1-24, cy0+90], r=16, f=(255,255,255), o=COL['stroke'], w=1)
    d.text((cx0+44, cy0+38), title, font=FH2, fill=COL['text'])
    badge(d, cx1-220, cy0+36, 'Live System', accent)
    d.text((cx0+44, cy0+98), subtitle, font=FS, fill=COL['muted'])
    return img, d, (cx0+24, cy0+130, cx1-24, cy1-24)


def card(d, b, t, s='', ac=None):
    rr(d, b, r=18, f=(255,255,255), o=COL['stroke'], w=1)
    if ac: d.rectangle([b[0], b[1], b[2], b[1]+8], fill=ac)
    d.text((b[0]+18, b[1]+16), t, font=FH2, fill=COL['text'])
    if s: para(d, b[0]+18, b[1]+52, b[2]-b[0]-36, s, FS, COL['muted'], 3)


def input_box(d, b, lab, val=''):
    d.text((b[0], b[1]-26), lab, font=FS, fill=COL['muted'])
    rr(d, b, r=12, f=(255,255,255), o=COL['stroke'], w=2)
    if val: d.text((b[0]+12, b[1]+10), val, font=FB, fill=COL['text'])


def button(d, b, txt, primary=True):
    if primary:
        rr(d, b, r=12, f=COL['accent'], o=(30,64,175), w=1); c = (255,255,255)
    else:
        rr(d, b, r=12, f=(255,255,255), o=COL['stroke'], w=1); c = COL['text']
    tw = d.textlength(txt, font=FB)
    d.text((b[0]+((b[2]-b[0])-tw)/2, b[1]+10), txt, font=FB, fill=c)

def fig_3_1(path):
    img = Image.new('RGB', (W, H)); grad(img)
    d = ImageDraw.Draw(img)
    d.text((60, 40), 'Fig 3.1  System Architecture', font=FT, fill=COL['text'])
    d.text((60, 98), 'Three-tier client-server architecture with integrated AI evaluation service.', font=FB, fill=COL['muted'])

    nodes = [
        ([90,250,550,440], 'Client Layer', 'Student, Evaluator and Admin access through browser UI.', (255,247,237), (251,146,60)),
        ([620,250,1140,440], 'Presentation Layer (React + Vite)', 'Pages, auth context, dashboard, task and submission UI.', (224,242,254), (2,132,199)),
        ([620,520,1140,730], 'Application Layer (Express API)', 'Auth, task, submission, stats and system controllers.', (220,252,231), (22,163,74)),
        ([1240,260,1830,500], 'Data Layer (MongoDB + File Storage)', 'Users, Tasks, Submissions, SubmissionBlob, SystemSetting and UPLOAD_DIR.', (237,233,254), (124,58,237)),
        ([1240,580,1830,730], 'External Service', 'Google Gemini API for rubric generation and AI-assisted evaluation.', (254,243,199), (245,158,11)),
    ]
    for b,t,s,f,o in nodes:
        rr(d, b, r=20, f=f, o=o, w=2); d.text((b[0]+18,b[1]+14), t, font=FH2, fill=COL['text']); para(d,b[0]+18,b[1]+48,b[2]-b[0]-36,s)

    arrow(d, (550,345), (620,345), label='HTTPS')
    arrow(d, (880,440), (880,520), label='REST API')
    arrow(d, (1140,610), (1240,610), label='Read/Write')
    arrow(d, (1140,650), (1240,655), label='AI prompt/result')
    d.text((60, H-68), 'Architecture enforces JWT-based session security and role-based access control.', font=FS, fill=COL['muted'])
    img.save(path)


def fig_3_3(path):
    img = Image.new('RGB', (W, H)); grad(img)
    d = ImageDraw.Draw(img)
    d.text((60, 40), 'Fig 3.3  System Workflow', font=FT, fill=COL['text'])
    d.text((60, 98), 'End-to-end flow from authentication to evaluation, notifications and analytics.', font=FB, fill=COL['muted'])
    steps = [
        ('1. Login', 'User authenticates and receives JWT token.'),
        ('2. Role Routing', 'Frontend opens Student, Evaluator or Admin workspace.'),
        ('3. Task Lifecycle', 'Evaluator creates tasks and students fetch assignments.'),
        ('4. Submission', 'Student uploads file and optional answer text.'),
        ('5. AI Assist', 'System extracts text and generates AI draft feedback.'),
        ('6. Manual Review', 'Evaluator finalizes marks and remarks.'),
        ('7. Dashboard + Alerts', 'Stats and notifications update for each role.'),
    ]
    cols = [(37,99,235),(13,148,136),(124,58,237),(22,163,74),(245,158,11),(225,29,72),(51,65,85)]
    pos = [(140,220),(730,220),(140,430),(730,430),(140,640),(730,640),(435,850)]
    for i, ((t,s), (x,y)) in enumerate(zip(steps, pos)):
        rr(d, [x,y,x+450,y+120], r=20, f=(255,255,255), o=cols[i], w=3)
        d.text((x+18,y+16), t, font=FH2, fill=COL['text']); para(d,x+18,y+50,414,s)
    for i in range(6):
        a = (pos[i][0]+450, pos[i][1]+60) if i % 2 == 0 else (pos[i][0]+225, pos[i][1]+120)
        b = (pos[i+1][0], pos[i+1][1]+60) if i % 2 == 0 else (pos[i+1][0]+225, pos[i+1][1])
        arrow(d, a, b)
    arrow(d, (1200,700), (1200,500), label='Reopen loop')
    d.text((60, H-68), 'Missed-deadline sync automatically marks non-submitted tasks as zero.', font=FS, fill=COL['muted'])
    img.save(path)


def fig_login(path):
    img = Image.new('RGB', (W, H)); grad(img, (236,245,255), (223,236,252))
    d = ImageDraw.Draw(img)
    d.text((60, 40), 'Fig 4.1.1  Login Page', font=FT, fill=COL['text'])
    rr(d, [620,150,1300,920], r=34, f=(255,255,255), o=COL['stroke'], w=2)
    d.text((815,208), 'DTE PORTAL', font=FH1, fill=COL['text']); d.text((770,262), 'Sign in to continue', font=FB, fill=COL['muted'])
    rr(d, [740,320,1180,380], r=16, f=(247,250,255), o=COL['stroke'], w=1)
    for i,(t,a) in enumerate([('Student',1),('Evaluator',0),('Admin',0)]):
        x = 760 + i*138; rr(d,[x,332,x+122,368],r=11,f=COL['accent'] if a else (255,255,255),o=COL['stroke'],w=1)
        d.text((x+20,342), t, font=FS, fill=(255,255,255) if a else COL['muted'])
    input_box(d,[740,430,1180,484],'Email Address','student@college.edu')
    input_box(d,[740,520,1180,574],'Password','************')
    button(d,[740,620,1180,678],'Sign In',True); button(d,[740,696,1180,754],'Forgot Password',False)
    img.save(path)


def fig_registration(path):
    img,d,c = shell('User Registration','Create evaluator, student and admin accounts','Admin',COL['accent'])
    x0,y0,x1,y1 = c
    L=[x0+20,y0+20,x0+640,y1-20]; R=[x0+680,y0+20,x1-20,y1-20]
    card(d,L,'Registration Form','Admin can create users by role and department.',COL['accent'])
    input_box(d,[L[0]+24,L[1]+92,L[2]-24,L[1]+146],'Full Name','Priya Sharma')
    input_box(d,[L[0]+24,L[1]+176,L[2]-24,L[1]+230],'Email','priya@college.edu')
    input_box(d,[L[0]+24,L[1]+260,L[2]-24,L[1]+314],'Password','StrongPassword#2026')
    input_box(d,[L[0]+24,L[1]+344,L[2]-24,L[1]+398],'Department','CSE')
    rr(d,[L[0]+24,L[1]+430,L[2]-24,L[1]+490],r=12,f=(247,250,255),o=COL['stroke'],w=1)
    d.text((L[0]+36,L[1]+446),'Role: Student / Evaluator / Admin',font=FB,fill=COL['muted'])
    button(d,[L[0]+24,L[1]+520,L[2]-24,L[1]+578],'Create User Account',True)
    card(d,R,'Access Policy','Role-based authorization controls module visibility.',COL['teal'])
    y=R[1]+90
    for ln in ['Student: submit assignments and view feedback.','Evaluator: create tasks and evaluate submissions.','Admin: manage users and maintenance settings.','Passwords stored using bcrypt hash.']:
        d.text((R[0]+24,y),'- '+ln,font=FB,fill=COL['text']); y += 48
    img.save(path)


def generic_ui(path, title, subtitle, role, cards):
    img,d,c = shell(title, subtitle, role, cards[0][2])
    x0,y0,x1,y1 = c
    cols = 2 if len(cards) <= 4 else 3
    gap = 14
    cw = (x1 - x0 - gap*(cols-1)) // cols
    ch = 250 if len(cards) > 4 else 300
    sy = y0 + 20
    for i,(t,s,color) in enumerate(cards):
        r,cc = divmod(i, cols)
        bx = [x0 + cc*(cw+gap), sy + r*(ch+gap), x0 + cc*(cw+gap) + cw, sy + r*(ch+gap) + ch]
        card(d,bx,t,s,color)
        # visual filler
        rr(d,[bx[0]+18,bx[1]+92,bx[2]-18,bx[1]+130],r=10,f=(247,250,255),o=COL['stroke'],w=1)
        d.text((bx[0]+28,bx[1]+102),'Sample UI block',font=FS,fill=COL['muted'])
        rr(d,[bx[0]+18,bx[1]+145,bx[2]-18,bx[1]+ch-18],r=10,f=(255,255,255),o=COL['stroke'],w=1)
        para(d,bx[0]+28,bx[1]+160,bx[2]-bx[0]-56,'Represents the functional section for this module: actions, lists, status and controls.',FS,COL['muted'],5)
    img.save(path)

def write_index():
    p = OUT / 'FIGURES_INDEX.md'
    lines = [
        '# Generated Report Figures', '',
        '## Chapter 3',
        '- Fig 3.1: System Architecture -> chapter3/fig_3_1_system_architecture.png',
        '- Fig 3.2: Data Flow Diagram -> chapter3/fig_3_2_data_flow_diagram.png',
        '- Fig 3.3: System Workflow -> chapter3/fig_3_3_system_workflow.png', '',
        '## Chapter 4',
        '- Fig 4.1.1: Login Page -> chapter4/fig_4_1_1_login_page.png',
        '- Fig 4.1.2: Registration Page -> chapter4/fig_4_1_2_registration_page.png',
        '- Fig 4.2.1: Admin Dashboard -> chapter4/fig_4_2_1_admin_dashboard.png',
        '- Fig 4.2.2: User Management Screen -> chapter4/fig_4_2_2_user_management_screen.png',
        '- Fig 4.2.3: Task Creation / Assignment -> chapter4/fig_4_2_3_task_creation_assignment.png',
        '- Fig 4.3.1: Task Submission Page -> chapter4/fig_4_3_1_task_submission_page.png',
        '- Fig 4.3.2: Submission History -> chapter4/fig_4_3_2_submission_history.png',
        '- Fig 4.4.1: Evaluation Interface -> chapter4/fig_4_4_1_evaluation_interface.png',
        '- Fig 4.5.1: Task Creation Page -> chapter4/fig_4_5_1_task_creation_page.png',
        '- Fig 4.5.2: Task List Interface -> chapter4/fig_4_5_2_task_list_interface.png',
        '- Fig 4.6.1: Notification System (Email/UI) -> chapter4/fig_4_6_1_notification_system_ui.png',
        '- Fig 4.7.1: User Dashboard -> chapter4/fig_4_7_1_user_dashboard.png',
        '- Fig 4.7.2: Evaluator Dashboard -> chapter4/fig_4_7_2_evaluator_dashboard.png', '',
        'Generated by scripts/generate_chapter_figures.py'
    ]
    p.write_text('\n'.join(lines), encoding='utf-8')


def main():
    fig_3_1(CH3 / 'fig_3_1_system_architecture.png')
    fig_3_3(CH3 / 'fig_3_3_system_workflow.png')

    src_dfd = BASE / 'docs' / 'diagrams' / 'dtep-data-flow-diagram-level-1.png'
    dst_dfd = CH3 / 'fig_3_2_data_flow_diagram.png'
    if src_dfd.exists():
        shutil.copy2(src_dfd, dst_dfd)
    else:
        fig_3_1(dst_dfd)

    fig_login(CH4 / 'fig_4_1_1_login_page.png')
    fig_registration(CH4 / 'fig_4_1_2_registration_page.png')

    generic_ui(CH4 / 'fig_4_2_1_admin_dashboard.png', 'Admin Dashboard', 'Global usage metrics and platform controls', 'Admin', [
        ('Overview KPIs','Users, evaluators, submissions and pending counts.', COL['success']),
        ('Activity Feed','Recent admin actions and system events.', COL['purple']),
        ('Maintenance Toggle','Enable or disable maintenance mode.', COL['warn']),
        ('Chart Panel','Open, pending, reviewed and missed trends.', COL['accent']),
    ])

    generic_ui(CH4 / 'fig_4_2_2_user_management_screen.png', 'User Management', 'Search, add, edit and remove user accounts', 'Admin', [
        ('User Table','Directory of users with role and department.', COL['accent']),
        ('Search and Filters','Locate users by name, email and role.', COL['teal']),
        ('Create User Action','Registration modal trigger for admin.', COL['success']),
        ('Secure Delete','Protected removal workflow.', COL['danger']),
    ])

    generic_ui(CH4 / 'fig_4_2_3_task_creation_assignment.png', 'Task Creation / Assignment', 'Design tasks and assign to student groups', 'Evaluator', [
        ('Task Form','Title, deadline, page requirements and description.', COL['teal']),
        ('Rubric Builder','AI/template rubric with scoring sections.', COL['accent']),
        ('Target Audience','Class/department assignment targeting.', COL['success']),
        ('Publish Control','Release task for student submissions.', COL['warn']),
    ])

    generic_ui(CH4 / 'fig_4_3_1_task_submission_page.png', 'Task Submission Page', 'Upload assignment file and optional answer text', 'Student', [
        ('Assigned Task','Task details and countdown timer.', COL['accent']),
        ('Upload Control','PDF/DOC/DOCX validation before submit.', COL['teal']),
        ('Answer Text','Optional text for improved AI analysis.', COL['purple']),
        ('Submission CTA','Finalize and send assignment.', COL['success']),
    ])

    generic_ui(CH4 / 'fig_4_3_2_submission_history.png', 'Submission History', 'Track submission status and results', 'Student', [
        ('History Table','All submitted tasks with timestamps.', COL['accent']),
        ('Status Tags','Pending, evaluated and missed indicators.', COL['warn']),
        ('Score View','Marks and evaluator remarks preview.', COL['success']),
        ('Retry Context','Reopened tasks and resubmission count.', COL['purple']),
    ])

    generic_ui(CH4 / 'fig_4_4_1_evaluation_interface.png', 'Evaluation Interface', 'Review submission with AI-assisted draft', 'Evaluator', [
        ('Submission Queue','Student list for current task.', COL['warn']),
        ('AI Assist','Draft marks and report generation.', COL['accent']),
        ('Manual Grading','Final marks and feedback editor.', COL['success']),
        ('Finalize Action','Save evaluation and update status.', COL['teal']),
    ])

    generic_ui(CH4 / 'fig_4_5_1_task_creation_page.png', 'Task Creation Page', 'Detailed assignment authoring workflow', 'Evaluator', [
        ('Input Fields','Title, deadline and required pages.', COL['teal']),
        ('Description Block','Task context and instructions.', COL['accent']),
        ('Rubric Sections','Marks distribution by section.', COL['purple']),
        ('Create Task','Persist task and publish.', COL['success']),
    ])

    generic_ui(CH4 / 'fig_4_5_2_task_list_interface.png', 'Task List Interface', 'Card/list view of created assignments', 'Evaluator', [
        ('Task Cards','Response rate and deadline summary.', COL['accent']),
        ('Status Labels','Active, pending and completed tags.', COL['teal']),
        ('Review Shortcut','Direct access to submissions.', COL['warn']),
        ('Delete Action','Owner/admin controlled delete.', COL['danger']),
    ])

    generic_ui(CH4 / 'fig_4_6_1_notification_system_ui.png', 'Notification System (Email/UI)', 'Realtime maintenance and task alerts', 'Student', [
        ('In-App Toasts','Live notification popups.', COL['warn']),
        ('Permission Prompt','Browser alert enable flow.', COL['accent']),
        ('Maintenance Banner','System-wide service announcements.', COL['danger']),
        ('Notification Feed','Chronological event history.', COL['teal']),
    ])

    generic_ui(CH4 / 'fig_4_7_1_user_dashboard.png', 'User Dashboard', 'Student progress and deadline insights', 'Student', [
        ('KPI Cards','Available tasks, pending and avg marks.', COL['accent']),
        ('Progress Chart','Open vs reviewed trend.', COL['teal']),
        ('Upcoming Deadlines','Next tasks due list.', COL['warn']),
        ('Recent Feedback','Latest evaluated remarks.', COL['success']),
    ])

    generic_ui(CH4 / 'fig_4_7_2_evaluator_dashboard.png', 'Evaluator Dashboard', 'Review pipeline and workload summary', 'Evaluator', [
        ('KPI Cards','Created tasks, pending reviews and averages.', COL['teal']),
        ('Review Pipeline','Submission state distribution.', COL['accent']),
        ('Priority Queue','Newest submissions for action.', COL['warn']),
        ('Performance Trend','Evaluation throughput over time.', COL['success']),
    ])

    write_index()


if __name__ == '__main__':
    main()
