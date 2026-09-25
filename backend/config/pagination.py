from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """Default pagination that allows the client to request a larger page.

    Used by admin list/export screens that need every filtered row at once
    (e.g. ``?page_size=1000``).
    """
    page_size_query_param = 'page_size'
    max_page_size = 5000


class LookupPagination(StandardPagination):
    """Config/lookup lists (prices, slots, capacities, routes, pickup points…).

    The booking screens fetch these WITHOUT a page_size and then .find() in the
    result — with the global default of 25 rows, anything past row 25 (e.g. a
    route's term price once there are >25 pricing rules) silently vanished, so
    the student saw «لا يوجد سعر» and could not create a subscription. These
    tables are small, so return them whole by default. Response shape is
    unchanged (still {count, next, previous, results}).
    """
    page_size = 1000
