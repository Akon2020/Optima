"use client";

import { formatMoney } from "@/shared/lib/money";
import { Field, Input, Select } from "@/shared/ui/field";

import type { DeliveryDetailsInput } from "../../domain/delivery";
import type { DeliveryZone } from "../../domain/types";

export const EMPTY_DELIVERY: DeliveryDetailsInput = {
  customerName: "",
  phone: "",
  address: "",
  zoneId: "",
  desiredTime: "",
};

/**
 * Coordonnées d'une commande en livraison (EF-LIV-01, D-070) : client,
 * téléphone, adresse ou quartier, zone (avec ses frais) et heure souhaitée.
 * Le contrôle complet se fait à la validation (`checkDeliveryDetails`).
 */
export function DeliveryFields({
  zones,
  value,
  onChange,
}: {
  zones: readonly DeliveryZone[];
  value: DeliveryDetailsInput;
  onChange: (value: DeliveryDetailsInput) => void;
}) {
  const active = zones.filter((zone) => zone.archivedAt === null);
  const update = (patch: Partial<DeliveryDetailsInput>) => onChange({ ...value, ...patch });

  return (
    <fieldset className="mt-4 grid gap-3 sm:grid-cols-2">
      <legend className="sr-only">Coordonnées de la livraison</legend>
      <Field label="Nom du client">
        {({ id }) => (
          <Input
            id={id}
            value={value.customerName}
            onChange={(event) => update({ customerName: event.target.value })}
            autoComplete="off"
            maxLength={80}
          />
        )}
      </Field>
      <Field label="Téléphone">
        {({ id }) => (
          <Input
            id={id}
            type="tel"
            inputMode="tel"
            value={value.phone}
            onChange={(event) => update({ phone: event.target.value })}
            placeholder="+243…"
            maxLength={24}
          />
        )}
      </Field>
      <Field label="Adresse ou quartier" className="sm:col-span-2">
        {({ id }) => (
          <Input
            id={id}
            value={value.address}
            onChange={(event) => update({ address: event.target.value })}
            maxLength={200}
          />
        )}
      </Field>
      <Field label="Zone">
        {({ id }) => (
          <Select
            id={id}
            value={value.zoneId}
            onChange={(event) => update({ zoneId: event.target.value })}
          >
            <option value="">Choisir…</option>
            {active.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name} · {zone.fee.amountMinor === 0 ? "gratuit" : formatMoney(zone.fee)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Heure souhaitée" optional hint="Vide : dès que possible.">
        {({ id, describedBy }) => (
          <Input
            id={id}
            type="time"
            value={value.desiredTime}
            onChange={(event) => update({ desiredTime: event.target.value })}
            aria-describedby={describedBy}
          />
        )}
      </Field>
    </fieldset>
  );
}
