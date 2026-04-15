import { AppointmentPayload, AppointmentSlot } from "@/types/stylist";
import { Button } from "@/components/ui/button";

interface StylistSlotPickerProps {
  appointment: AppointmentPayload;
  onBookSlot: (slot: AppointmentSlot) => void;
  onShowMore: () => void;
}

export function StylistSlotPicker({ appointment, onBookSlot, onShowMore }: StylistSlotPickerProps) {
  if (appointment.mode === "first_available_booked" && appointment.booked_slot) {
    const s = appointment.booked_slot;
    return (
      <div className="mt-3 rounded-lg border border-border bg-muted/10 p-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Appointment Confirmed</p>
        <p className="mt-1 text-sm font-medium">
          {s.name} · {s.date} · {s.time_slot} EST
        </p>
        {s.store_city ? <p className="mt-1 text-xs text-muted-foreground">{s.store_city}{s.store_name ? ` · ${s.store_name}` : ""}</p> : null}
        {appointment.associate_note ? <p className="mt-2 text-xs text-muted-foreground">{appointment.associate_note}</p> : null}
      </div>
    );
  }

  if (appointment.mode === "booking_confirmed" && appointment.booked_slot) {
    const s = appointment.booked_slot;
    return (
      <div className="mt-3 rounded-lg border border-border bg-muted/10 p-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Booked Slot</p>
        <p className="mt-1 text-sm font-medium">
          {s.name} · {s.date} · {s.time_slot} EST
        </p>
        {s.store_city ? <p className="mt-1 text-xs text-muted-foreground">{s.store_city}{s.store_name ? ` · ${s.store_name}` : ""}</p> : null}
        {appointment.associate_note ? <p className="mt-2 text-xs text-muted-foreground">{appointment.associate_note}</p> : null}
      </div>
    );
  }

  const slots = appointment.available_slots ?? [];
  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/10 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Appointment With a Stylist</p>
        <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={onShowMore}>
          Refresh Slots
        </Button>
      </div>
      {appointment.suggestion_block ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {appointment.suggestion_block.message} Next dates: {appointment.suggestion_block.next_3_available_dates.join(", ")}
        </p>
      ) : null}
      <div className="mt-2 max-h-52 overflow-y-auto divide-y divide-border rounded border border-border bg-background">
        {slots.map((slot) => (
          <div key={`${slot.stylist_id}-${slot.date}-${slot.time_slot}`} className="flex items-center justify-between px-2.5 py-2">
            <div>
              <p className="text-xs font-medium">{slot.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {slot.date} · {slot.time_slot} EST{slot.store_city ? ` · ${slot.store_city}` : ""}
              </p>
            </div>
            <Button
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => onBookSlot(slot)}
              disabled={slot.is_booked}
            >
              Book
            </Button>
          </div>
        ))}
        {slots.length === 0 ? (
          <div className="px-2.5 py-2 text-xs text-muted-foreground">No slots available in this range.</div>
        ) : null}
      </div>
    </div>
  );
}

