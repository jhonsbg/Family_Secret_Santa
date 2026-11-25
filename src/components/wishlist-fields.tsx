import { wishFields, wishLimit, type Wishes } from "@/lib/participant/wishes";

export function WishlistFields({ wishes, readOnly }: { wishes: Wishes; readOnly: boolean }) {
  return wishFields.map(([key, label]) => <label key={key}>{label}
    <textarea name={key} defaultValue={wishes[key]} maxLength={wishLimit} rows={2} readOnly={readOnly} />
  </label>);
}
