"use client";
import { FiltersSection } from "./panels/CorePanels";
import Popover from "./Popover";

// Lets you add/remove which dataset columns are filters directly from the
// live report, instead of only via the sidebar's "Filters (slicers)"
// section. Positioning, dragging, and the portal/backdrop/Escape shell all
// live in Popover.jsx, shared with CellEditPopover.
export default function FilterConfigPopover({ anchorRect, dataset, filters, addFilter, removeFilter, onClose }) {
  return (
    <Popover anchorRect={anchorRect} title="Edit filters" onClose={onClose}>
      <FiltersSection dataset={dataset} filters={filters} addFilter={addFilter} removeFilter={removeFilter} />
    </Popover>
  );
}
