"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cardsApi, type PokemonCardResult } from "@/lib/api";

interface Props {
  value: string;
  onChange: (name: string) => void;
  onSelectCard: (card: PokemonCardResult) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

export default function PokemonCardSearch({ value, onChange, onSelectCard, placeholder, className, id }: Props) {
  const [results, setResults] = useState<PokemonCardResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const lastQueryRef = useRef("");
  const listboxId = useRef(`pkm-search-${Math.random().toString(36).slice(2)}`).current;

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    lastQueryRef.current = q;
    if (q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    debounceRef.current = setTimeout(async () => {
      const myId = ++requestIdRef.current;
      try {
        const res = await cardsApi.searchPokemon(q.trim());
        if (myId === requestIdRef.current) {
          setResults(res.data);
          setHighlighted(0);
          setError(false);
        }
      } catch {
        if (myId === requestIdRef.current) {
          setResults([]);
          setError(true);
        }
      } finally {
        if (myId === requestIdRef.current) setLoading(false);
      }
    }, 300);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleInput(v: string) {
    onChange(v);
    setOpen(true);
    search(v);
  }

  function select(card: PokemonCardResult) {
    onSelectCard(card);
    setOpen(false);
    setResults([]);
  }

  function retry() {
    if (lastQueryRef.current.trim().length >= 2) search(lastQueryRef.current);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && results[highlighted]) {
      e.preventDefault();
      select(results[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <svg
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
          style={{ color: "var(--text-muted)" }}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open && (results.length > 0 || error || (!loading && value.trim().length >= 2))}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && results.length > 0 ? `${listboxId}-opt-${highlighted}` : undefined}
          value={value}
          onChange={e => handleInput(e.target.value)}
          onFocus={() => { setOpen(true); if (value.trim().length >= 2) search(value); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? "Buscar carta Pokémon..."}
          autoComplete="off"
          className={className ?? "w-full rounded-xl pl-10 pr-4 py-3 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 transition-all"}
          style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
        />
        {loading && (
          <span
            className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
            style={{ color: "var(--accent-text)" }}
            role="status"
            aria-label="Buscando cartas"
          />
        )}
      </div>

      {open && results.length > 0 && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Resultados de búsqueda de cartas"
          className="absolute z-50 mt-2 w-full max-h-80 overflow-y-auto rounded-xl shadow-2xl"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", boxShadow: "0 20px 50px rgba(0,0,0,0.4)" }}
        >
          {results.map((card, idx) => (
            <button
              key={card.id}
              id={`${listboxId}-opt-${idx}`}
              role="option"
              aria-selected={idx === highlighted}
              type="button"
              onClick={() => select(card)}
              onMouseEnter={() => setHighlighted(idx)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
              style={{
                background: idx === highlighted ? "rgba(37,99,235,0.14)" : "transparent",
                borderBottom: idx < results.length - 1 ? "1px solid var(--border-subtle)" : "none",
              }}
            >
              {card.image ? (
                <img src={card.image} alt="" className="w-8 h-11 object-contain rounded shrink-0" />
              ) : (
                <div className="w-8 h-11 rounded shrink-0 flex items-center justify-center text-sm" style={{ background: "var(--bg-surface)" }} aria-hidden="true">🃏</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{card.name}</p>
                <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                  {card.set}{card.number ? ` · #${card.number}` : ""}{card.rarity ? ` · ${card.rarity}` : ""}
                </p>
              </div>
              {card.marketPriceCents != null && (
                <span className="text-xs font-bold shrink-0 text-right" style={{ color: "var(--accent-text)" }}>
                  ${(card.marketPriceCents / 100).toLocaleString("en-US")}
                  <span className="block text-[9px] font-normal" style={{ color: "var(--text-muted)" }}>USD ref.</span>
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {open && error && (
        <div
          role="alert"
          className="absolute z-50 mt-2 w-full rounded-xl px-4 py-3 text-xs flex items-center justify-between gap-3"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        >
          <span>No se pudo conectar con la base de datos de cartas.</span>
          <button
            type="button"
            onClick={retry}
            className="shrink-0 font-semibold underline underline-offset-2"
            style={{ color: "var(--accent-text)" }}
          >
            Reintentar
          </button>
        </div>
      )}

      {open && !loading && !error && results.length === 0 && value.trim().length >= 2 && (
        <div
          role="status"
          className="absolute z-50 mt-2 w-full rounded-xl px-4 py-3 text-xs"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
        >
          Sin resultados para &ldquo;{value}&rdquo; en la base de datos Pokémon.
        </div>
      )}
    </div>
  );
}
