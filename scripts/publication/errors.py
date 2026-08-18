"""Fail-closed publication-control errors."""


class PublicationError(ValueError):
    """A publication attempt, inventory, or configuration check failed closed."""
