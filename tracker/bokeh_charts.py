"""
Bokeh Visualization Engine for GONE App.
Renders responsive, interactive, theme-aligned Bokeh charts for:
1. Category Donut: #chart-category
2. Daily Trend Pulse: #chart-trend
3. Six-Month Comparisons: #chart-monthly
4. Savings Journey: #chart-savings-trend
"""
import datetime
from math import pi
from bokeh.plotting import figure
from bokeh.models import ColumnDataSource, HoverTool
from bokeh.embed import components

# Theme Palette Tokens from GONE Design System
PALETTE = {
    'wood': '#35241b',
    'wood_soft': '#5d4635',
    'muted': '#705a48',
    'line': 'rgba(203, 179, 146, 0.45)',
    'paper': '#ede0d0',
    'paper_light': '#f8f0e5',
    'terracotta': '#b9684d',
    'terracotta_deep': '#8c4837',
    'sand': '#c49a6c',
    'dust': '#a67379',
    'sage': '#7d7f52',
    'sage_deep': '#4e5839',
}

CATEGORY_COLORS = {
    'Food': '#b9684d',      # Terracotta
    'Travel': '#c49a6c',    # Sand
    'Shopping': '#a67379',  # Dust / Rose
    'Bills': '#7d7f52',     # Sage
    'Other': '#705a48',     # Muted wood
    'Income': '#4e5839',    # Deep sage
}

def apply_theme(p):
    """Apply transparent background, crisp typography and soft gridlines."""
    p.background_fill_color = None
    p.border_fill_color = None
    p.outline_line_color = None
    if hasattr(p, 'grid'):
        p.grid.grid_line_color = PALETTE['line']
        p.grid.grid_line_dash = [3, 3]
    if hasattr(p, 'axis'):
        p.axis.axis_line_color = PALETTE['line']
        p.axis.major_tick_line_color = PALETTE['line']
        p.axis.minor_tick_line_color = None
        p.axis.major_label_text_color = PALETTE['wood_soft']
        p.axis.major_label_text_font_size = '11px'
        p.axis.major_label_text_font = 'Manrope, sans-serif'
    if hasattr(p, 'title') and p.title:
        p.title.text_color = PALETTE['wood']
        p.title.text_font = 'Manrope, sans-serif'
        p.title.text_font_size = '13px'


def generate_category_donut(entries):
    """
    1. Category Donut: #chart-category
    Spending distribution across categories for the current month.
    """
    now = datetime.datetime.now()
    curr_month = now.strftime('%Y-%m')

    # Aggregate spending by category
    cat_totals = {}
    for e in entries:
        kind = getattr(e, 'kind', None) or e.get('kind', 'spent')
        date_str = getattr(e, 'date', None) or e.get('date', '')
        if kind == 'spent' and date_str.startswith(curr_month):
            cat = getattr(e, 'category', None) or e.get('category', 'Other') or 'Other'
            amt = float(getattr(e, 'amount', 0) or e.get('amount', 0))
            cat_totals[cat] = cat_totals.get(cat, 0.0) + amt

    total_spent = sum(cat_totals.values())

    p = figure(
        height=260,
        sizing_mode='stretch_width',
        toolbar_location=None,
        x_range=(-1.3, 1.3),
        y_range=(-1.3, 1.3),
    )
    apply_theme(p)
    p.axis.visible = False
    p.grid.visible = False

    if total_spent <= 0:
        # Empty state wedge
        p.annular_wedge(
            x=0, y=0,
            inner_radius=0.55, outer_radius=0.88,
            start_angle=0, end_angle=2 * pi,
            color=PALETTE['line'],
            line_color=PALETTE['paper_light'],
            line_width=1.5
        )
        p.text(
            x=[0], y=[0],
            text=["No spending yet"],
            text_align="center",
            text_baseline="middle",
            text_color=PALETTE['muted'],
            text_font="Manrope, sans-serif",
            text_font_size="12px"
        )
        return components(p)

    categories = list(cat_totals.keys())
    amounts = [cat_totals[c] for c in categories]
    percents = [round((amt / total_spent) * 100, 1) for amt in amounts]
    colors = [CATEGORY_COLORS.get(c, PALETTE['terracotta']) for c in categories]

    # Calculate start and end angles
    angles = [(amt / total_spent) * 2 * pi for amt in amounts]
    start_angles = []
    end_angles = []
    current_angle = 0.0
    for angle in angles:
        start_angles.append(current_angle)
        current_angle += angle
        end_angles.append(current_angle)

    source = ColumnDataSource(data=dict(
        category=categories,
        amount=amounts,
        amount_fmt=[f"₹{int(a):,}" for a in amounts],
        percent=percents,
        start=start_angles,
        end=end_angles,
        color=colors
    ))

    renderer = p.annular_wedge(
        x=0, y=0,
        inner_radius=0.55, outer_radius=0.90,
        start_angle='start', end_angle='end',
        color='color',
        line_color=PALETTE['paper_light'],
        line_width=2,
        source=source
    )

    hover = HoverTool(
        renderers=[renderer],
        tooltips=[
            ("Category", "@category"),
            ("Total Spent", "@amount_fmt"),
            ("Share", "@percent%")
        ]
    )
    p.add_tools(hover)

    # Center label showing monthly total
    p.text(
        x=[0, 0],
        y=[0.08, -0.12],
        text=["TOTAL", f"₹{int(total_spent):,}"],
        text_align="center",
        text_baseline="middle",
        text_color=[PALETTE['muted'], PALETTE['wood']],
        text_font=["Manrope, sans-serif", "Manrope, sans-serif"],
        text_font_size=["10px", "14px"]
    )

    return components(p)


def generate_trend_pulse(entries):
    """
    2. Daily Trend Pulse: #chart-trend
    Last 7 days daily spending line & area pulse.
    """
    today = datetime.date.today()
    last_7_days = [today - datetime.timedelta(days=i) for i in reversed(range(7))]
    day_keys = [d.strftime('%Y-%m-%d') for d in last_7_days]
    day_labels = [d.strftime('%a') for d in last_7_days]
    date_formatted = [d.strftime('%d %b') for d in last_7_days]

    daily_totals = {k: 0.0 for k in day_keys}
    for e in entries:
        kind = getattr(e, 'kind', None) or e.get('kind', 'spent')
        date_str = getattr(e, 'date', None) or e.get('date', '')
        if kind == 'spent' and date_str in daily_totals:
            amt = float(getattr(e, 'amount', 0) or e.get('amount', 0))
            daily_totals[date_str] += amt

    amounts = [daily_totals[k] for k in day_keys]
    max_amt = max(amounts) if amounts else 0
    y_top = max(100.0, max_amt * 1.25)

    p = figure(
        x_range=day_labels,
        y_range=(0, y_top),
        height=260,
        sizing_mode='stretch_width',
        toolbar_location=None
    )
    apply_theme(p)

    source = ColumnDataSource(data=dict(
        days=day_labels,
        dates=date_formatted,
        amounts=amounts,
        amounts_fmt=[f"₹{int(a):,}" for a in amounts]
    ))

    # Area fill
    p.varea(
        x='days', y1=0, y2='amounts',
        source=source,
        fill_color=PALETTE['terracotta'],
        fill_alpha=0.18
    )

    # Crisp line
    p.line(
        x='days', y='amounts',
        source=source,
        line_width=3,
        color=PALETTE['terracotta']
    )

    # Point glyphs with Hover
    pts = p.scatter(
        x='days', y='amounts',
        source=source,
        size=8,
        marker='circle',
        fill_color=PALETTE['paper_light'],
        line_color=PALETTE['terracotta'],
        line_width=2
    )

    hover = HoverTool(
        renderers=[pts],
        tooltips=[
            ("Day", "@dates (@days)"),
            ("Spent", "@amounts_fmt")
        ]
    )
    p.add_tools(hover)

    return components(p)


def generate_monthly_bars(entries):
    """
    3. Six-Month Comparisons: #chart-monthly
    Month-by-month spending comparisons.
    """
    today = datetime.date.today()
    months_data = []
    for i in reversed(range(6)):
        # Approximate month offset
        year = today.year
        month = today.month - i
        while month <= 0:
            month += 12
            year -= 1
        m_str = f"{year:04d}-{month:02d}"
        label = datetime.date(year, month, 1).strftime('%b')
        months_data.append((m_str, label))

    month_keys = [m[0] for m in months_data]
    month_labels = [m[1] for m in months_data]
    month_totals = {k: 0.0 for k in month_keys}

    for e in entries:
        kind = getattr(e, 'kind', None) or e.get('kind', 'spent')
        date_str = getattr(e, 'date', None) or e.get('date', '')
        if kind == 'spent':
            for k in month_keys:
                if date_str.startswith(k):
                    amt = float(getattr(e, 'amount', 0) or e.get('amount', 0))
                    month_totals[k] += amt

    amounts = [month_totals[k] for k in month_keys]
    max_amt = max(amounts) if amounts else 0
    y_top = max(100.0, max_amt * 1.2)

    bar_colors = [
        PALETTE['sand'],
        PALETTE['terracotta'],
        PALETTE['dust'],
        PALETTE['sage'],
        PALETTE['wood_soft'],
        PALETTE['terracotta']
    ]

    p = figure(
        x_range=month_labels,
        y_range=(0, y_top),
        height=260,
        sizing_mode='stretch_width',
        toolbar_location=None
    )
    apply_theme(p)

    source = ColumnDataSource(data=dict(
        months=month_labels,
        amounts=amounts,
        amounts_fmt=[f"₹{int(a):,}" for a in amounts],
        colors=bar_colors
    ))

    bars = p.vbar(
        x='months',
        top='amounts',
        width=0.52,
        color='colors',
        border_radius=5,
        source=source
    )

    hover = HoverTool(
        renderers=[bars],
        tooltips=[
            ("Month", "@months"),
            ("Total Spent", "@amounts_fmt")
        ]
    )
    p.add_tools(hover)

    return components(p)


def generate_savings_journey(entries, saving_goal=None):
    """
    4. Savings Journey: #chart-savings-trend
    6-month cumulative / net savings (Received minus Spent) with target goal benchmark.
    """
    today = datetime.date.today()
    months_data = []
    for i in reversed(range(6)):
        year = today.year
        month = today.month - i
        while month <= 0:
            month += 12
            year -= 1
        m_str = f"{year:04d}-{month:02d}"
        label = datetime.date(year, month, 1).strftime('%b')
        months_data.append((m_str, label))

    month_keys = [m[0] for m in months_data]
    month_labels = [m[1] for m in months_data]

    net_saved_by_month = {}
    for k in month_keys:
        received = 0.0
        spent = 0.0
        for e in entries:
            date_str = getattr(e, 'date', None) or e.get('date', '')
            if date_str.startswith(k):
                kind = getattr(e, 'kind', None) or e.get('kind', 'spent')
                amt = float(getattr(e, 'amount', 0) or e.get('amount', 0))
                if kind == 'received':
                    received += amt
                elif kind == 'spent':
                    spent += amt
        net_saved_by_month[k] = max(0.0, received - spent)

    saved_values = [net_saved_by_month[k] for k in month_keys]
    goal_val = float(saving_goal or 0)
    top_y = max(100.0, max(saved_values + [goal_val]) * 1.25)

    p = figure(
        x_range=month_labels,
        y_range=(0, top_y),
        height=260,
        sizing_mode='stretch_width',
        toolbar_location=None
    )
    apply_theme(p)

    source = ColumnDataSource(data=dict(
        months=month_labels,
        saved=saved_values,
        saved_fmt=[f"₹{int(s):,}" for s in saved_values]
    ))

    # Area fill
    p.varea(
        x='months', y1=0, y2='saved',
        source=source,
        fill_color=PALETTE['sage'],
        fill_alpha=0.22
    )

    # Line
    p.line(
        x='months', y='saved',
        source=source,
        line_width=3,
        color=PALETTE['sage']
    )

    # Points with Hover
    pts = p.scatter(
        x='months', y='saved',
        source=source,
        size=8,
        marker='circle',
        fill_color=PALETTE['paper_light'],
        line_color=PALETTE['sage'],
        line_width=2
    )

    hover = HoverTool(
        renderers=[pts],
        tooltips=[
            ("Month", "@months"),
            ("Net Saved", "@saved_fmt")
        ]
    )
    p.add_tools(hover)

    # Goal benchmark reference line
    if goal_val > 0:
        goal_source = ColumnDataSource(data=dict(
            months=month_labels,
            goal=[goal_val] * len(month_labels),
            goal_fmt=[f"₹{int(goal_val):,}"] * len(month_labels)
        ))
        p.line(
            x='months', y='goal',
            source=goal_source,
            line_width=2,
            line_dash='dashed',
            color=PALETTE['terracotta'],
            legend_label=f"Goal (₹{int(goal_val):,})"
        )
        if p.legend:
            p.legend.location = "top_left"
            p.legend.background_fill_color = PALETTE['paper_light']
            p.legend.background_fill_alpha = 0.85
            p.legend.border_line_color = PALETTE['line']
            p.legend.label_text_font = "Manrope, sans-serif"
            p.legend.label_text_font_size = "10px"
            p.legend.label_text_color = PALETTE['wood_soft']

    return components(p)
