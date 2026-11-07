"use client";

import { Building2, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { CURRENCIES, type Currency } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { Card, CardHeader } from "@/shared/ui/card";
import { Field, Input, Select } from "@/shared/ui/field";

import { TIME_ZONES, slugify } from "@/modules/owner";
import { ESTABLISHMENT_TYPES } from "@/modules/registry";

import { createEstablishmentAction } from "../actions";
import { HeaderPreview } from "./header-preview";

const CURRENCY_LABELS: Record<Currency, string> = {
  CDF: "Franc congolais (CDF)",
  USD: "Dollar américain (USD)",
};

/** Création d'un établissement (EF-ETB-01, EF-ETB-02, RG-ETB-01). */
export function CreateEstablishmentForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isSlugEdited, setIsSlugEdited] = useState(false);
  const [legalName, setLegalName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState<string>(ESTABLISHMENT_TYPES[0].id);
  const [currency, setCurrency] = useState<Currency>("CDF");
  const [timeZone, setTimeZone] = useState<string>(TIME_ZONES[0].id);
  const [withDefaultServicePoints, setWithDefaultServicePoints] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const effectiveSlug = isSlugEdited ? slug : slugify(name);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setError(null);
    try {
      const result = await createEstablishmentAction({
        name,
        slug: effectiveSlug,
        legalName,
        address,
        phone,
        type,
        currency,
        timeZone,
        withDefaultServicePoints,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/proprietaire/etablissements/${result.data.id}?cree=1`);
    } catch {
      setError("Serveur injoignable. La création exige une connexion Internet.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      noValidate
      className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
    >
      <div className="flex flex-col gap-6">
        {error ? (
          <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}
        <Card>
          <CardHeader title="Identité" description="Elle figure sur les tickets et les factures." />
          <div className="flex flex-col gap-4">
            <Field label="Nom de l'établissement">
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  required
                />
              )}
            </Field>
            <Field
              label="Adresse dans OPTIMA"
              hint={`Les écrans de l'établissement seront sous /e/${effectiveSlug || "…"}. Elle ne change plus ensuite.`}
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={effectiveSlug}
                  onChange={(event) => {
                    setIsSlugEdited(true);
                    setSlug(event.target.value.toLowerCase());
                  }}
                  maxLength={40}
                  autoCapitalize="off"
                  spellCheck={false}
                  required
                />
              )}
            </Field>
            <Field label="Raison sociale" optional>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={legalName}
                  onChange={(event) => setLegalName(event.target.value)}
                  maxLength={120}
                />
              )}
            </Field>
            <Field label="Adresse" optional>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  maxLength={200}
                />
              )}
            </Field>
            <Field label="Téléphone" optional>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  maxLength={30}
                  inputMode="tel"
                />
              )}
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Activité" />
          <div className="flex flex-col gap-4">
            <Field label="Type d'activité" hint="La boutique de détecteurs viendra en phase 2.">
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                >
                  {ESTABLISHMENT_TYPES.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-xs font-medium">Devise de base</legend>
              {CURRENCIES.map((value) => (
                <label
                  key={value}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-subtle"
                >
                  <input
                    type="radio"
                    name="currency"
                    value={value}
                    checked={currency === value}
                    onChange={() => setCurrency(value)}
                    className="size-4 accent-primary"
                  />
                  {CURRENCY_LABELS[value]}
                </label>
              ))}
              <p className="flex gap-2 text-xs text-text-muted">
                <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                Elle ne pourra plus être modifiée, pour que tous les montants restent comparables
                (RG-ETB-01).
              </p>
            </fieldset>
            <Field label="Fuseau horaire">
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  value={timeZone}
                  onChange={(event) => setTimeZone(event.target.value)}
                >
                  {TIME_ZONES.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {type === "restaurant" ? (
              <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={withDefaultServicePoints}
                  onChange={(event) => setWithDefaultServicePoints(event.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
                <span>
                  Créer les points de service habituels : Comptoir (boissons), Cuisine et Grillade
                  (nourriture).
                </span>
              </label>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader title="Aperçu de l'en-tête" />
          <HeaderPreview
            identity={{
              name,
              legalName: legalName.trim() || null,
              address: address.trim() || null,
              phone: phone.trim() || null,
            }}
          />
        </Card>
        <Button type="submit" variant="primary" size="lg" disabled={isPending}>
          <Building2 aria-hidden />
          {isPending ? "Création…" : "Créer l'établissement"}
        </Button>
        <p className="text-xs text-text-muted">
          Ensuite : créez le compte du gérant dans « Équipe », puis appairez les appareils du
          restaurant.
        </p>
      </div>
    </form>
  );
}
