import { motion, AnimatePresence } from "framer-motion";
import { useRef, useState } from "react";
import { Plus, Trash2, Camera, X, Check, Tag, Download, Repeat, Loader2 } from "lucide-react";
import { useCabana, useCabanaMutations, type CabanaProduct } from "@/lib/cabana-store";
import { Button } from "@/components/ui/button";
import { useDebouncedField } from "@/hooks/use-debounced-callback";
import { ConfirmDeleteButton } from "@/components/cabana/dashboard/ConfirmDeleteButton";

const TYPES: CabanaProduct["type"][] = ["Physical", "Download", "Membership"];
const TYPE_ICON = { Physical: Tag, Download: Download, Membership: Repeat } as const;

export function StoreManager() {
  const { products, loading } = useCabana();
  const m = useCabanaMutations();
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-display font-semibold tracking-tighter">
            Storefront
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sell physical, digital, and membership products in one place.
          </p>
        </div>
        <Button onClick={() => m.addProduct()} variant="cta" size="sm" className="!rounded-full">
          <Plus className="w-4 h-4" /> New product
        </Button>
      </div>

      {loading ? (
        <div className="glass rounded-3xl p-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading products…
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map((p, i) => {
            const Badge = TYPE_ICON[p.type];
            return (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="glass rounded-3xl overflow-hidden group relative"
              >
                <div className="relative aspect-[4/5] overflow-hidden">
                  <img
                    src={p.img}
                    alt={p.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full glass-strong text-[10px] flex items-center gap-1">
                    <Badge className="w-2.5 h-2.5" /> {p.type}
                  </div>
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <ConfirmDeleteButton
                      onConfirm={() => m.removeProduct(p.id)}
                      idleLabel="Delete product"
                      idleClassName="w-7 h-7 rounded-full glass-strong flex items-center justify-center text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </ConfirmDeleteButton>
                  </div>
                </div>
                <button onClick={() => setEditing(p.id)} className="block w-full text-left p-4">
                  <div className="font-medium text-sm truncate">{p.title}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-iridescent font-display font-semibold">{p.price}</span>
                    <span className="text-xs text-muted-foreground">{p.sales} sold</span>
                  </div>
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      {!loading && products.length === 0 && (
        <div className="glass rounded-3xl p-10 text-center text-sm text-muted-foreground">
          No products yet. Click <span className="text-foreground font-medium">New product</span> to
          start.
        </div>
      )}

      <AnimatePresence>
        {editing && products.find((p) => p.id === editing) && (
          <ProductDrawer
            product={products.find((p) => p.id === editing)!}
            onClose={() => setEditing(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ProductDrawer({ product, onClose }: { product: CabanaProduct; onClose: () => void }) {
  const m = useCabanaMutations();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background/70 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg glass-strong rounded-3xl p-6 shadow-luxury"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-semibold">Edit product</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-4 mb-5">
          <div className="relative shrink-0">
            <img src={product.img} className="w-24 h-32 rounded-2xl object-cover" alt="" />
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full glass-strong flex items-center justify-center hover:scale-110 transition-transform"
            >
              <Camera className="w-4 h-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) m.uploadProductImage(product.id, f);
              }}
            />
          </div>
          <div className="flex-1 space-y-3">
            <Field
              label="Title"
              value={product.title}
              onChange={(v) => m.updateProduct(product.id, { title: v })}
            />
            <Field
              label="Price"
              value={product.price}
              onChange={(v) => m.updateProduct(product.id, { price: v })}
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wider">Type</label>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {TYPES.map((t) => {
              const I = TYPE_ICON[t];
              const selected = product.type === t;
              return (
                <button
                  key={t}
                  onClick={() => m.updateProduct(product.id, { type: t })}
                  className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    selected
                      ? "bg-iridescent text-background shadow-glow"
                      : "bg-foreground/5 hover:bg-foreground/10 text-muted-foreground"
                  }`}
                >
                  <I className="w-3.5 h-3.5" /> {t}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <ConfirmDeleteButton
            onConfirm={() => {
              m.removeProduct(product.id);
              onClose();
            }}
            idleLabel="Delete product"
            idleClassName="text-xs px-4 py-2 rounded-full bg-destructive/15 text-destructive hover:bg-destructive/25 flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </ConfirmDeleteButton>
          <Button onClick={onClose} variant="cta" size="sm" className="!rounded-full !text-xs">
            <Check className="w-3.5 h-3.5" /> Done
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [local, setLocal] = useDebouncedField(value, onChange);
  return (
    <div>
      <label className="text-xs text-muted-foreground uppercase tracking-wider">{label}</label>
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        className="w-full mt-1.5 bg-foreground/5 border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50 transition-colors"
      />
    </div>
  );
}
