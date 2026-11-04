import { Button } from "./UI";
import { Icon } from "./Icon";
import { WordReveal } from "./Motion";

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
      <h1>
        <WordReveal text="С чего начнём?" />
      </h1>

      <p>
        <WordReveal
          text="Твои модели и ключи в одном интерфейсе."
          start={120}
        />
        <br />
        <WordReveal
          text="Сейчас здесь локальная имитация ответов."
          start={440}
        />
      </p>

      <div className="suggestions">
        {suggestions.map((suggestion, index) => (
          <span
            key={suggestion.label}
            data-enter
            data-delay={680 + index * 45}
          >
            <Button
              className="suggestion"
              onClick={() => onSuggestion(suggestion.text)}
            >
              {suggestion.label}
              <Icon name="north_east" size={18} />
            </Button>
          </span>
        ))}
      </div>
    </section>
  );
}
