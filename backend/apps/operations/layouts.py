"""Physical seat layouts for the fleet.

Each layout is a list of rows; a row is a list of cells rendered left→right.
Cell tokens:
  int   -> a seat with that number
  'D'   -> driver position
  'x'   -> aisle / empty spacer (keeps seats aligned, not selectable)
The frontend renders these to a visual seat map; the backend uses `seat_set`
to validate that a chosen seat number belongs to the layout.
"""

LAYOUTS = {
    'bus50': {
        'id': 'bus50',
        'name': 'أتوبيس (٥٠ راكب)',
        'capacity': 49,
        'rows': [
            ['D', 'x', 'x', 'x', 'x'],
            [1, 2, 'x', 3, 4],
            [5, 6, 'x', 7, 8],
            [9, 10, 'x', 11, 12],
            [13, 14, 'x', 15, 16],
            [17, 18, 'x', 19, 20],
            [21, 22, 'x', 'x', 'x'],
            [23, 24, 'x', 'x', 'x'],
            [25, 26, 'x', 27, 28],
            [29, 30, 'x', 31, 32],
            [33, 34, 'x', 35, 36],
            [37, 38, 'x', 39, 40],
            [41, 42, 'x', 43, 44],
            [45, 46, 47, 48, 49],
        ],
    },
    'hiace15': {
        'id': 'hiace15',
        'name': 'هاي إيس (١٥ راكب)',
        'capacity': 15,
        'rows': [
            ['D', 'x', 1, 2],
            [3, 4, 5, 'x'],
            [6, 7, 8, 'x'],
            [9, 10, 11, 'x'],
            [12, 13, 14, 15],
        ],
    },
}

LAYOUT_CHOICES = [(k, v['name']) for k, v in LAYOUTS.items()]
DEFAULT_LAYOUT = 'bus50'


def seat_set(layout_id):
    layout = LAYOUTS.get(layout_id, LAYOUTS[DEFAULT_LAYOUT])
    return {c for row in layout['rows'] for c in row if isinstance(c, int)}


def layout_capacity(layout_id):
    return LAYOUTS.get(layout_id, LAYOUTS[DEFAULT_LAYOUT])['capacity']
