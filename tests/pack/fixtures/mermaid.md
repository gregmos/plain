# Mermaid и диаграммы

## Валидная диаграмма

```mermaid
graph TD
  A[открыть файл] --> B{есть правки?}
  B -- да --> C[записать атомарно]
  B -- нет --> D[ничего не писать]
```

## Битая диаграмма

```mermaid
graph TD
  A --> ((((
  ??? not a diagram
```

## Просто код

```ts
export function render(text: string): string {
  return text.trim(); // $5 не формула
}
```

```rust
fn main() {
    println!("привет");
}
```

```unknown-language-xyz
ничего не подсветится
```

Отметка для поиска: иголка-mermaid-013 — не трогать.
