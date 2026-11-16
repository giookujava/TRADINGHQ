import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card } from "@/components/ui";
import { CUSTOM_FIELD_TYPES, TAG_CATEGORIES, TAG_CATEGORY_LABELS } from "@/lib/constants";
import { getRefData } from "@/lib/data/queries";
import { requireUser } from "@/lib/supabase/server";
import { saveCustomField, saveStrategy, saveTag } from "../actions";

export const metadata = { title: "Journal setup" };

export default async function JournalSettings() {
  const { supabase } = await requireUser();
  const { strategies, tags, customFields } = await getRefData(supabase);

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card title="Strategies / setups">
        <p className="mb-3 text-xs text-muted">Optional label per trade. Trades are never forced into a strategy.</p>
        {strategies.map((s) => (
          <ActionForm key={s.id} action={saveStrategy} className="border-b border-line/60 py-2">
            <input type="hidden" name="id" value={s.id} />
            <div className="flex flex-wrap items-center gap-2">
              <input name="name" className="field w-48 flex-none" defaultValue={s.name} required />
              <input name="description" className="field min-w-40 flex-1" defaultValue={s.description} placeholder="Description" />
              <label className="inline-flex items-center gap-1 text-xs text-muted"><input type="checkbox" name="is_active" defaultChecked={s.is_active} /> Active</label>
              <SubmitButton className="btn-sm" name="intent" value="save">Save</SubmitButton>
              <SubmitButton className="btn-sm btn-danger" name="intent" value="delete" confirm={`Delete strategy “${s.name}”?`}>✕</SubmitButton>
            </div>
          </ActionForm>
        ))}
        <ActionForm action={saveStrategy} resetOnSuccess className="pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <input name="name" className="field w-48 flex-none" placeholder="New strategy, e.g. Silver Bullet" required />
            <input name="description" className="field min-w-40 flex-1" placeholder="Description" />
            <input type="hidden" name="is_active" value="on" />
            <SubmitButton className="btn-sm btn-primary">Add</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <Card title="Tags">
        <p className="mb-3 text-xs text-muted">
          Free-form labels for concepts outside the built-in ICT fields, mistakes and market conditions.
        </p>
        {TAG_CATEGORIES.map((cat) => {
          const list = tags.filter((t) => t.category === cat);
          if (!list.length) return null;
          return (
            <div key={cat} className="mb-2">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-faint">{TAG_CATEGORY_LABELS[cat]}</div>
              {list.map((t) => (
                <ActionForm key={t.id} action={saveTag} className="py-1">
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="category" value={t.category} />
                  <div className="flex items-center gap-2">
                    <input type="color" name="color" defaultValue={t.color} className="h-7 w-8 cursor-pointer rounded border border-line bg-bg" aria-label="Colour" />
                    <input name="name" className="field flex-1" defaultValue={t.name} required />
                    <SubmitButton className="btn-sm" name="intent" value="save">Save</SubmitButton>
                    <SubmitButton className="btn-sm btn-danger" name="intent" value="delete" confirm={`Delete tag “${t.name}”? It will be removed from all trades.`}>✕</SubmitButton>
                  </div>
                </ActionForm>
              ))}
            </div>
          );
        })}
        <ActionForm action={saveTag} resetOnSuccess className="border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <input type="color" name="color" defaultValue="#4cc2d6" className="h-7 w-8 cursor-pointer rounded border border-line bg-bg" aria-label="Colour" />
            <input name="name" className="field min-w-32 flex-1" placeholder="New tag, e.g. Judas swing" required />
            <select name="category" className="field w-40 flex-none" defaultValue="custom">
              {TAG_CATEGORIES.map((c) => <option key={c} value={c}>{TAG_CATEGORY_LABELS[c]}</option>)}
            </select>
            <SubmitButton className="btn-sm btn-primary">Add</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <Card title="Custom trade fields" className="xl:col-span-2">
        <p className="mb-3 text-xs text-muted">
          Extra fields that appear on every trade form. For “select”, list options separated by commas.
        </p>
        {customFields.map((c) => (
          <ActionForm key={c.id} action={saveCustomField} className="border-b border-line/60 py-2">
            <input type="hidden" name="id" value={c.id} />
            <div className="flex flex-wrap items-center gap-2">
              <input name="name" className="field w-48 flex-none" defaultValue={c.name} required />
              <select name="field_type" className="field w-28 flex-none" defaultValue={c.field_type}>
                {CUSTOM_FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input name="options" className="field min-w-40 flex-1" defaultValue={c.options.join(", ")} placeholder="Options (select only)" />
              <input name="sort_order" type="number" className="field w-20 flex-none" defaultValue={c.sort_order} aria-label="Order" />
              <label className="inline-flex items-center gap-1 text-xs text-muted"><input type="checkbox" name="is_active" defaultChecked={c.is_active} /> Active</label>
              <SubmitButton className="btn-sm" name="intent" value="save">Save</SubmitButton>
              <SubmitButton className="btn-sm btn-danger" name="intent" value="delete" confirm={`Delete field “${c.name}”?`}>✕</SubmitButton>
            </div>
          </ActionForm>
        ))}
        <ActionForm action={saveCustomField} resetOnSuccess className="pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <input name="name" className="field w-48 flex-none" placeholder="Field name, e.g. News event" required />
            <select name="field_type" className="field w-28 flex-none" defaultValue="text">
              {CUSTOM_FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input name="options" className="field min-w-40 flex-1" placeholder="Options (select only), e.g. CPI, FOMC, NFP" />
            <input type="hidden" name="is_active" value="on" />
            <SubmitButton className="btn-sm btn-primary">Add</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
