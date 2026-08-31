from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """Default pagination that allows the client to request a larger page.

    Used by admin list/export screens that need every filtered row at once
    (e.g. ``?page_size=1000``).
    """
    page_size_query_param = 'page_size'
    max_page_size = 5000
