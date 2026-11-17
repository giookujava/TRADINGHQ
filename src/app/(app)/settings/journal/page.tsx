import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card } from "@/components/ui";
import { CUSTOM_FIELD_TYPES, TAG_CATEGORIES } from "@/lib/constants";
import { getRefData } from "@/lib/data/queries";
import { fmt } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/supabase/server";
import { saveCustomField, saveStrategy, saveTag } from "../actions";

export const metadata = { title: "Journal setup" };

export default async function JournalSettings() {
  const { supabase } = await requireUser();
  const [L, { strategies, tags, customFields }] = await Promise.all([getT(), getRefData(supabase)]);
  const S = L.set;
  const chk = "h-4 w-4 accent-[var(--accent)]";
  const swatch = "h-9 w-10 cursor-pointer rounded-lg border border-line bg-surface-2";

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card title={S.strategies} subtitle={S.strategiesHint}>
        {strategies.map((s) => (
          <ActionForm key={s.id} action={saveStrategy} className="border-b border-line py-2.5">
            <input type="hidden" name="id" value={s.id} />
            <div className="flex flex-wrap items-center gap-2">
              <input name="name" className="field w-48 flex-none" defaultValue={s.name} required />
              <input name="description" className="field min-w-40 flex-1" defaultValue={s.description} placeholder={S.description} />
              <label className="inline-flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" name="is_active" defaultChecked={s.is_active} className={chk} /> {L.common.active}</label>
              <SubmitButton className="btn-sm" name="intent" value="save">{L.common.save}</SubmitButton>
              <SubmitButton className="btn-sm btn-danger" name="intent" value="delete" confirm={fmt(S.deleteStrategy, { n: s.name })}>✕</SubmitButton>
            </div>
          </ActionForm>
        ))}
        <ActionForm action={saveStrategy} resetOnSuccess className="pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <input name="name" className="field w-48 flex-none" placeholder={S.newStrategyPh} required />
            <input name="description" className="field min-w-40 flex-1" placeholder={S.description} />
            <input type="hidden" name="is_active" value="on" />
            <SubmitButton className="btn-sm btn-primary">{L.common.add}</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <Card title={S.tags} subtitle={S.tagsHint}>
        {TAG_CATEGORIES.map((cat) => {
          const list = tags.filter((x) => x.category === cat);
          if (!list.length) return null;
          return (
            <div key={cat} className="mb-3">
              <div className="eyebrow mb-1">{L.labels.tagCategories[cat]}</div>
              {list.map((g) => (
                <ActionForm key={g.id} action={saveTag} className="py-1">
                  <input type="hidden" name="id" value={g.id} />
                  <input type="hidden" name="category" value={g.category} />
                  <div className="flex items-center gap-2">
                    <input type="color" name="color" defaultValue={g.color} className={swatch} aria-label={S.colour} />
                    <input name="name" className="field flex-1" defaultValue={g.name} required />
                    <SubmitButton className="btn-sm" name="intent" value="save">{L.common.save}</SubmitButton>
                    <SubmitButton className="btn-sm btn-danger" name="intent" value="delete" confirm={fmt(S.deleteTag, { n: g.name })}>✕</SubmitButton>
                  </div>
                </ActionForm>
              ))}
            </div>
          );
        })}
        <ActionForm action={saveTag} resetOnSuccess className="border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <input type="color" name="color" defaultValue="#2dd4e8" className={swatch} aria-label={S.colour} />
            <input name="name" className="field min-w-32 flex-1" placeholder={S.newTagPh} required />
            <select name="category" className="field w-44 flex-none" defaultValue="custom">
              {TAG_CATEGORIES.map((c) => <option key={c} value={c}>{L.labels.tagCategories[c]}</option>)}
            </select>
            <SubmitButton className="btn-sm btn-primary">{L.common.add}</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <Card title={S.customFields} subtitle={S.customFieldsHint} className="xl:col-span-2">
        {customFields.map((c) => (
          <ActionForm key={c.id} action={saveCustomField} className="border-b border-line py-2.5">
            <input type="hidden" name="id" value={c.id} />
            <div className="flex flex-wrap items-center gap-2">
              <input name="name" className="field w-48 flex-none" defaultValue={c.name} required />
              <select name="field_type" className="field w-28 flex-none" defaultValue={c.field_type}>
                {CUSTOM_FIELD_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <input name="options" className="field min-w-40 flex-1" defaultValue={c.options.join(", ")} placeholder={S.optionsPh} />
              <input name="sort_order" type="number" className="field w-20 flex-none" defaultValue={c.sort_order} aria-label={S.order} />
              <label className="inline-flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" name="is_active" defaultChecked={c.is_active} className={chk} /> {L.common.active}</label>
              <SubmitButton className="btn-sm" name="intent" value="save">{L.common.save}</SubmitButton>
              <SubmitButton className="btn-sm btn-danger" name="intent" value="delete" confirm={fmt(S.deleteField, { n: c.name })}>✕</SubmitButton>
            </div>
          </ActionForm>
        ))}
        <ActionForm action={saveCustomField} resetOnSuccess className="pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <input name="name" className="field w-48 flex-none" placeholder={S.fieldNamePh} required />
            <select name="field_type" className="field w-28 flex-none" defaultValue="text">
              {CUSTOM_FIELD_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <input name="options" className="field min-w-40 flex-1" placeholder={S.optionsExamplePh} />
            <input type="hidden" name="is_active" value="on" />
            <SubmitButton className="btn-sm btn-primary">{L.common.add}</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
