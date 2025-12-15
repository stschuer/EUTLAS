# Design Principles - EUTLAS Frontend

Diese Prinzipien unterstützen die Entwicklung von Produkten, die den Bedürfnissen und Fähigkeiten der Benutzer entsprechen und dadurch eine positive User Experience ermöglichen.

---

## 1. Visibility (Sichtbarkeit)

Wichtige Features und Steuerungselemente müssen für den Benutzer klar erkennbar sein, um eine intuitive Bedienung zu gewährleisten.

**Umsetzung in EUTLAS:**

- Cluster-Status prominent auf Cards angezeigt
- Wichtige Aktionen (Create, Delete) in Header platziert
- Klare visuelle Hierarchie mit Tailwind utilities
- Breadcrumbs für Navigation

**Komponenten:**
- `PageHeader` - Titel und Aktionen klar sichtbar
- `ClusterCard` - Status-Badge prominent
- `StatusBadge` - Farbcodierte Zustände

---

## 2. Affordances (Handlungsaufforderungen)

Objekte sollen durch ihr Design signalisieren, wie sie verwendet werden können.

**Umsetzung in EUTLAS:**

- Buttons mit Hover-Effekten (`hover:bg-primary/90`)
- Cards mit Cursor-Pointer für klickbare Bereiche
- Inputs mit klarem Focus-Ring
- Drag-Handles für sortierbare Listen

**Tailwind Classes:**
```css
/* Clickable card */
hover:border-primary/50 cursor-pointer transition-all

/* Interactive button */
hover:bg-primary/90 active:scale-95
```

---

## 3. Signifiers (Hinweiszeichen)

Zusätzliche Hinweise wie Symbole oder Beschriftungen helfen dem Benutzer.

**Umsetzung in EUTLAS:**

- Icons + Labels bei allen Aktionen
- Tooltips für komplexe Funktionen
- Placeholder-Text erklärt Eingabeformat
- Help-Icons bei Formularfeldern

**Komponenten:**
- `FormField` - Label + Tooltip + Error
- `SimpleTooltip` - Erklärungen bei Hover
- `EmptyState` - Erklärt nächste Schritte

---

## 4. Mapping (Zuordnung)

Die Beziehung zwischen Steuerelementen und Funktionen sollte logisch sein.

**Umsetzung in EUTLAS:**

- Zusammengehörige Felder in `FormSection` gruppiert
- Wizard-Steps in logischer Reihenfolge
- Actions-Dropdown gruppiert verwandte Aktionen
- Left-to-right, top-to-bottom Leserichtung

**Komponenten:**
- `CreateClusterWizard` - Schrittweise Führung
- `PlanSelector` - Optionen nebeneinander
- `DropdownMenu` - Gruppierte Aktionen

---

## 5. Feedback (Rückmeldung)

Nach jeder Aktion sollte das System Feedback geben.

**Umsetzung in EUTLAS:**

- `LoadingSpinner` während Operationen
- Toast-Notifications nach Aktionen
- Button-Disable während Submission
- Progress-Indicator im Wizard

**Komponenten:**
- `LoadingSpinner`, `PageLoading` - Ladezustände
- `useToast` - Erfolg/Fehler Meldungen
- `StatusBadge` - Animierte In-Progress States

**Toast Beispiel:**
```tsx
toast({
  title: "Cluster created!",
  description: "Your cluster is being provisioned.",
});
```

---

## 6. Constraints (Einschränkungen)

Einschränkungen leiten den Benutzer und verhindern Fehlbedienung.

**Umsetzung in EUTLAS:**

- Disabled States für nicht verfügbare Aktionen
- Formularvalidierung mit Zod vor Absenden
- Max-Length bei Textfeldern mit Counter
- Conditional UI (z.B. Delete nur wenn ready)

**Validierung:**
```tsx
const schema = z.object({
  name: z.string()
    .min(3, "Mind. 3 Zeichen")
    .max(30, "Max. 30 Zeichen")
    .regex(/^[a-z][a-z0-9-]*$/, "Nur lowercase"),
});
```

---

## 7. Error Tolerance (Fehlertolerantes Design)

Produkte sollten Fehler vermeiden oder deren Auswirkungen minimieren.

**Umsetzung in EUTLAS:**

- `ConfirmDialog` für destruktive Aktionen
- Soft-Delete statt permanentem Löschen
- Auto-Save für Formulare (geplant)
- Hilfreiche Fehlermeldungen mit Lösungsvorschlägen

**Komponenten:**
- `ConfirmDialog` - "Sind Sie sicher?"
- Formular-Errors mit Erklärung
- Retry-Button bei Fehlern

---

## 8. Consistency (Konsistenz)

Einheitliches Design erleichtert das Erlernen.

**Umsetzung in EUTLAS:**

- Design Tokens in `design-tokens.ts`
- shadcn/ui Komponenten als Basis
- Einheitliche Spacing-Scale (Tailwind)
- Konsistente Icon-Library (Lucide)

**Design Tokens:**
```ts
// Farben
--primary: 160 84% 39%;    // Emerald
--accent: 186 100% 42%;    // Cyan

// Status
success: #10b981
warning: #f59e0b
error: #ef4444
```

---

## Checkliste für neue Features

Bei der Implementierung neuer Features:

- [ ] Ist das Feature gut sichtbar und auffindbar?
- [ ] Signalisieren interaktive Elemente klar ihre Funktion?
- [ ] Sind Hinweiszeichen (Labels, Icons) vorhanden?
- [ ] Ist die Zuordnung von Kontrollen zu Funktionen logisch?
- [ ] Gibt es angemessenes Feedback nach Aktionen?
- [ ] Verhindern Einschränkungen Fehlbedienung?
- [ ] Ist das Design fehlertolerant?
- [ ] Ist das Design konsistent mit dem Rest der Anwendung?

---

## Tailwind Utility Classes Reference

### Interaktive Zustände
```css
/* Button */
hover:bg-primary/90 active:scale-95 disabled:opacity-50

/* Card */
hover:border-primary/50 hover:bg-card transition-all cursor-pointer

/* Link */
hover:text-primary hover:underline
```

### Feedback-Animationen
```css
/* Loading */
animate-spin animate-pulse

/* Erscheinen */
animate-fade-in animate-slide-in

/* Status-Glow */
animate-ping (für active dots)
```

### Konsistente Spacing
```css
/* Cards */
p-4 md:p-6

/* Sections */
space-y-4 md:space-y-6

/* Grid */
gap-4 md:gap-6
```





