"""Shared Django Unfold admin mixins to make all form and filter dropdowns searchable."""

from django.utils.translation import gettext_lazy as _
from unfold import widgets
from unfold.admin import ModelAdmin as UnfoldModelAdmin
from unfold.admin import TabularInline as UnfoldTabularInline


class SearchableDropdownMixin:
    """
    Ensure every dropdown in Django Admin add/change forms and inlines is searchable:
    - Fields in `autocomplete_fields` use Django's AJAX Select2 autocomplete widget.
    - Choice fields, null-boolean choice fields, and any remaining ForeignKey fields
      use `UnfoldAdminSelect2Widget` (Select2 search box inside the dropdown).
    """

    def formfield_for_choice_field(self, db_field, request, **kwargs):
        if "widget" not in kwargs and db_field.name not in getattr(self, "radio_fields", ()):
            kwargs["widget"] = widgets.UnfoldAdminSelect2Widget()
        return super().formfield_for_choice_field(db_field, request, **kwargs)

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if "widget" not in kwargs:
            autocomplete = self.get_autocomplete_fields(request)
            raw_ids = getattr(self, "raw_id_fields", ())
            radios = getattr(self, "radio_fields", ())
            if (
                db_field.name not in autocomplete
                and db_field.name not in raw_ids
                and db_field.name not in radios
            ):
                kwargs["widget"] = widgets.UnfoldAdminSelect2Widget()
                kwargs.setdefault("empty_label", _("Select value"))
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def formfield_for_nullboolean_field(self, db_field, request, **kwargs):
        if "widget" not in kwargs and getattr(db_field, "choices", None):
            kwargs["widget"] = widgets.UnfoldAdminSelect2Widget(
                choices=list(db_field.choices)
            )
        return super().formfield_for_nullboolean_field(db_field, request, **kwargs)


class SearchableModelAdmin(SearchableDropdownMixin, UnfoldModelAdmin):
    """Unfold ModelAdmin with searchable form dropdowns and filter submit support."""

    list_filter_submit = True


class SearchableTabularInline(SearchableDropdownMixin, UnfoldTabularInline):
    """Unfold TabularInline with searchable form dropdowns."""
