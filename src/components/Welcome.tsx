import { Button } from "./ui";
import { Icon } from "./Icon";

const suggestions = [
  {
    label: "Разобрать идею",
    text: "Помоги разобрать идею приложения и составить план реализации.",
  },
  {
    label: "Написать код",
    text: "Покажи пример типизированной функции на TypeScript и объясни её работу.",
  },
  {
    label: "Объяснить проще",
    text: "Объясни простыми словами, как работает потоковая генерация ответа.",
  },
  {
    label: "Найти решение",
    text: "Помоги разбить сложную задачу на небольшие проверяемые шаги.",
  },
];

export function Welcome({
  onSuggestion,
}: {
  onSuggestion: (text: string) => void;
}) {
  return (
    <section className="empty-state">
      <h1>С чего начнём?</h1>
      <p>
        Твои модели и ключи в одном интерфейсе.
        <br />
        Сейчас здесь локальная имитация ответов.
      </p>

      <div className="suggestions">
        {suggestions.map((suggestion) => (
          <Button
            className="suggestion"
            key={suggestion.label}
            onClick={() => onSuggestion(suggestion.text)}
          >
            {suggestion.label}
            <Icon name="north_east" size={18} />
          </Button>
        ))}
      </div>
    </section>
  );
}
