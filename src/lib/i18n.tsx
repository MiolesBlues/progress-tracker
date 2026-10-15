import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useSession } from "./session";
import { defaultDayNames } from "./workout";

export type Language = "ru" | "en";
const STORAGE_PREFIX = "app:language:v1:";

// Russian source text is the key. Missing English translations fail at typed call sites.
// User-authored names and notes never enter this dictionary.
export const english = {
  "Прогресс Трекер": "Progress Tracker",
  Настройки: "Settings",
  Закрыть: "Close",
  "Язык интерфейса": "Interface language",
  Русский: "Русский",
  English: "English",
  Выйти: "Sign out",
  Тренировка: "Workout",
  Программа: "Program",
  Записи: "Entries",
  Прогресс: "Progress",
  Вход: "Sign in",
  "Настройка программы": "Program setup",
  "Тренировочный день": "Training day",
  Упражнение: "Exercise",
  Повторить: "Retry",
  Назад: "Back",
  Далее: "Next",
  Сохранить: "Save",
  "Загрузка…": "Loading…",
  "Загрузка программы…": "Loading program…",
  "Загрузка тренировочных дней…": "Loading training days…",
  "Настройка программы…": "Setting up program…",
  "Каждый подход —": "Every set —",
  "в цифрах.": "tracked.",
  "Ваша программа из 1–7 дней с любыми названиями, запись результатов и сравнение тренировок. Upper/Lower доступен как необязательный шаблон.":
    "Create a personal 1–7 day program, log results and compare workouts. Upper/Lower is an optional template.",
  Начать: "Get started",
  "Шаг {step} из 3": "Step {step} of 3",
  "Сколько тренировочных дней в неделю?": "How many training days per week?",
  "Число дней можно изменить позже в «Программе».":
    "You can change the number of days later in Program.",
  "С чего начать?": "Where would you like to start?",
  "Пустая программа": "Empty program",
  "Сами добавите упражнения в каждый день.": "Add exercises to each day yourself.",
  "Шаблон Upper/Lower": "Upper/Lower template",
  "4 дня, 25 упражнений со стартовыми весами. Всё редактируется.":
    "Four days and 25 exercises with starting weights. You can edit everything.",
  "Названия дней": "Day names",
  "Например: Push, Pull, Legs, Upper, Lower, Full Body":
    "For example: Push, Pull, Legs, Upper, Lower, Full Body",
  "Название дня": "Day name",
  "День {number}": "Day {number}",
  "Создаю…": "Creating…",
  Готово: "Done",
  "У каждого дня должно быть название": "Every day needs a name",
  "Программа уже создана": "The program already exists",
  "Не удалось создать программу": "Could not create the program",
  "Тренировочные дни": "Training days",
  "Изменить дни": "Edit days",
  "{count} из {max} активных дней": "{count} of {max} active days",
  "Название нового дня": "New day name",
  "Новый день": "New day",
  "Добавить день": "Add day",
  "Можно иметь не более 7 активных дней.": "You can have at most 7 active days.",
  "Архив дней": "Archived days",
  "Упражнения архивного дня": "Exercises in archived day",
  Упражнения: "Exercises",
  "День для упражнений": "Day for exercises",
  "Нет активных дней. Создайте или восстановите день через «Изменить дни».":
    "No active days. Create or restore a day using Edit days.",
  "Упражнений пока нет.": "No exercises yet.",
  "Добавить упражнение": "Add exercise",
  "Архив упражнений": "Archived exercises",
  "Упражнения без дня": "Exercises without a day",
  "Без назначенного дня · {count}": "No assigned day · {count}",
  "Эти упражнения сохранены без привязки к дню. Выберите день вручную и сохраните. История останется без изменений.":
    "These exercises have no assigned day. Choose a day and save. Their history will stay unchanged.",
  "Редактирование упражнения": "Edit exercise",
  "Упражнение будет добавлено в выбранный тренировочный день.":
    "The exercise will be added to the selected training day.",
  "Новое упражнение": "New exercise",
  "Название упражнения": "Exercise name",
  "Количество подходов": "Number of sets",
  "Целевой диапазон повторений": "Target rep range",
  "Упражнение добавлено": "Exercise added",
  "Отменить переименование": "Cancel rename",
  "Переименовать день: {name}": "Rename day: {name}",
  "День: {name}": "Day: {name}",
  "Восстановить день": "Restore day",
  "Архивировать день": "Archive day",
  "Нужен хотя бы один активный день.": "At least one active day is required.",
  "Переместить день {name}": "Move day {name}",
  "Переместить упражнение {name}": "Move exercise {name}",
  "Редактировать: {name}": "Edit: {name}",
  "Восстановить: {name}": "Restore: {name}",
  "В архив: {name}": "Archive: {name}",
  "Упражнение: {name}": "Exercise: {name}",
  "Цель не задана": "No target set",
  "Перенос возможен только в активный день": "You can move an exercise only to an active day",
  "{count} упр.": "{count} exercises",
  "{count} подх.": "{count} sets",
  "{count} повт.": "{count} reps",
  "Не удалось загрузить программу.": "Could not load the program.",
  "Программа изменилась. Обновите страницу и повторите действие.":
    "The program changed. Reload and try again.",
  "Не удалось сохранить изменения. Проверьте соединение и повторите попытку.":
    "Could not save changes. Check your connection and try again.",
  "Не удалось сохранить изменения": "Could not save changes",
  "Выберите активный тренировочный день перед добавлением упражнения.":
    "Choose an active training day before adding an exercise.",
  "Выбранный тренировочный день больше недоступен. Выберите активный день заново.":
    "The selected training day is no longer available. Choose an active day again.",
  "Укажите число подходов и целевой диапазон повторений.":
    "Enter the number of sets and the target rep range.",
  "Выбранный тренировочный день больше недоступен. Упражнение не создано.":
    "The selected training day is no longer available. The exercise was not created.",
  "Проверьте данные упражнения.": "Check the exercise details.",
  "Не удалось загрузить программу тренировки.": "Could not load the workout program.",
  "Нет активных дней.": "There are no active days.",
  "Добавьте или восстановите день": "Add or restore a day",
  "В этом дне нет активных упражнений.": "This day has no active exercises.",
  "Добавьте упражнение": "Add an exercise",
  "Все упражнения этого дня пройдены. Можно выбрать упражнение для дополнительной сессии.":
    "All exercises for this day are done. You can choose any exercise for an extra session.",
  "Запись тренировки": "Workout entry",
  Дата: "Date",
  "Рабочий вес, кг": "Working weight, kg",
  "Укажите вес": "Enter weight",
  "Повторения · подходов: {count}": "Repetitions · sets: {count}",
  "Убрать подход": "Remove set",
  "Добавить подход": "Add set",
  "В каждом поле — повторения одного подхода. Пустой подход нужно заполнить или явно убрать.":
    "Each field is one set. Fill or explicitly remove an empty set.",
  "Подход {number}": "Set {number}",
  "RIR (необязательно)": "RIR (optional)",
  Заметки: "Notes",
  "Сохранение…": "Saving…",
  "Повторить сохранение": "Retry save",
  "План {plan}": "Plan {plan}",
  "Было {weight} кг × {reps}": "Previous {weight} kg × {reps}",
  "Истории нет": "No history",
  "Загрузка предыдущей тренировки…": "Loading previous workout…",
  "Не удалось загрузить предыдущую тренировку. Введённые значения сохранены; можно повторить загрузку или заполнить форму вручную.":
    "Could not load the previous workout. Your input is safe; retry or fill the form manually.",
  "Ваша тренировка сохранена": "Your workout was saved",
  "Черновик не сохранён на устройстве. Проверьте доступ к хранилищу и повторите сохранение.":
    "The draft could not be saved on this device. Check storage access and try again.",
  "Есть незавершённый черновик за {date}. Текущая дата сохранена.":
    "There is an unfinished draft for {date}. The current date was kept.",
  "Открыть черновик за {date}": "Open draft for {date}",
  "Начать новый черновик": "Start a new draft",
  "Операция ожидает подтверждения. При повторе отправятся те же значения; поля временно заблокированы.":
    "The save is awaiting confirmation. Retry uses the same values; fields are temporarily locked.",
  "Не удалось прочитать черновик. Сохранённые данные не изменены.":
    "Could not read the draft. Saved data was not changed.",
  "Не удалось прочитать черновик выбранной даты. Сохранённые данные не изменены.":
    "Could not read the draft for this date. Saved data was not changed.",
  "Не удалось сохранить операцию на устройстве. Запрос не отправлен; проверьте доступ к хранилищу.":
    "Could not save the operation on this device. Nothing was sent; check storage access.",
  "Запись сохранена, но локальный черновик удалить не удалось. Повтор той же операции безопасен.":
    "The entry was saved, but the local draft could not be removed. Retrying the same operation is safe.",
  "Не удалось подтвердить сохранение. Повторите попытку.": "Could not confirm the save. Try again.",
  "Не удалось записать новый черновик.": "Could not write the new draft.",
  "Удалить повреждённый черновик этого упражнения и начать заново? Сначала проверьте историю: запись могла уже сохраниться.":
    "Delete this damaged draft and start again? Check the history first; the entry may already have been saved.",
  "Результат сохранения не подтверждён. Повторите попытку: повтор не создаст вторую запись.":
    "Save was not confirmed. Retry safely: it will not create a second entry.",
  "Эта операция уже сохранена с другими значениями. Проверьте историю; запись не перезаписана.":
    "This operation was saved with different values. Check history; the entry was not overwritten.",
  "Запись отклонена. Проверьте значения, активность упражнения и выбранный день.":
    "Entry rejected. Check values, exercise status and selected day.",
  "Сервер не подтвердил сохранение. Повторите попытку с теми же данными.":
    "The server did not confirm the save. Retry with the same values.",
  "Название: от 1 до {max} символов": "Name: 1 to {max} characters",
  "Выберите существующий день": "Choose an existing day",
  "Число подходов: от 1 до 20": "Sets: 1 to 20",
  "Вес должен быть неотрицательным числом": "Weight must be a non-negative number",
  "Повторения: число или диапазон, например 8–12": "Reps: a number or range, such as 8–12",
  "Невозможно изменить порядок": "Could not change the order",
  "Заполните поле «{label}». Пустое значение не равно нулю.":
    "Enter {label}. An empty value is not zero.",
  "{label}: введите число, не более {places} знаков после запятой.":
    "{label}: enter a number with at most {places} decimal places.",
  "{label}: допустимо от 0 до {max}.": "{label}: allowed range is 0 to {max}.",
  "Выберите активное упражнение и его тренировочный день.":
    "Choose an active exercise and its training day.",
  "Допустимо от 1 до {max} подходов.": "Allowed number of sets: 1 to {max}.",
  "Заполните подход {number} или явно уберите его кнопкой «Убрать подход».":
    "Fill set {number} or explicitly remove it with Remove set.",
  "Подход {number}: нужно одно целое число. Последовательность 8-8-7-6 вводите в четыре отдельных поля.":
    "Set {number}: enter one integer. Enter 8-8-7-6 in four separate fields.",
  "Подход {number}: допустимо от 0 до {max} повторений.":
    "Set {number}: allowed range is 0 to {max} reps.",
  "Укажите существующую дату тренировки.": "Enter a valid workout date.",
  "Заметка: не более 1000 символов.": "Note: at most 1000 characters.",
  "День записей": "Entry day",
  "Упражнение записей": "Entry exercise",
  "Дневник записей упражнения": "Exercise entries diary",
  "Не удалось загрузить программу для выбора записей.":
    "Could not load the program for selecting entries.",
  "Сначала добавьте тренировочный день и упражнения в программе.":
    "First add a training day and exercises in Program.",
  "В этом дне пока нет упражнений с записями.": "This day has no exercises with entries yet.",
  "Не удалось загрузить записи упражнения.": "Could not load exercise entries.",
  "Загрузка записей…": "Loading entries…",
  Период: "Period",
  "Фильтр по дате": "Date filter",
  Сегодня: "Today",
  "7 дней": "7 days",
  "30 дней": "30 days",
  Сортировка: "Sort",
  "Сортировка записей": "Sort entries",
  "Сначала новые": "Newest first",
  "Вес: по убыванию": "Weight: high to low",
  "Вес: по возрастанию": "Weight: low to high",
  "Записи · {count}": "Entries · {count}",
  "За выбранный период записей нет.": "No entries in this period.",
  "Страницы записей": "Entry pages",
  "Страница {page} из {pages}": "Page {page} of {pages}",
  "Нет активных дней": "No active days",
  "Без назначенного дня": "No assigned day",
  "Без названия дня": "Unnamed day",
  " (архив)": " (archived)",
  "Страница не найдена.": "Page not found.",
  "На главную": "Home",
  "Не удалось загрузить страницу": "Could not load the page",
  "Проверка сессии…": "Checking session…",
  "Не удалось загрузить данные. Проверьте соединение или войдите в аккаунт повторно.":
    "Could not load data. Check your connection or sign in again.",
  "Не удалось проверить сессию. Проверьте соединение и повторите загрузку.":
    "Could not verify your session. Check your connection and try again.",
  "Не удалось загрузить тренировочные дни.": "Could not load training days.",
  "С возвращением!": "Welcome back!",
  "Создать аккаунт": "Create an account",
  "Ваши тренировки видны только вам.": "Your workouts are visible only to you.",
  "Начните отслеживать свои тренировки": "Start tracking your workouts",
  Пароль: "Password",
  "Подтвердите пароль": "Confirm password",
  "Пароли не совпадают": "Passwords do not match",
  "Показать пароль": "Show password",
  "Скрыть пароль": "Hide password",
  "Показать подтверждение пароля": "Show password confirmation",
  "Скрыть подтверждение пароля": "Hide password confirmation",
  "Входим…": "Signing in…",
  "Регистрируемся…": "Signing up…",
  Войти: "Sign in",
  Зарегистрироваться: "Sign up",
  "Продолжить с Google": "Continue with Google",
  "Нет аккаунта?": "No account?",
  "Уже есть аккаунт?": "Already have an account?",
  "Проверьте почту и подтвердите регистрацию": "Check your email to confirm your registration",
  "Неверный email или пароль.": "Incorrect email or password.",
  "Подтвердите email по ссылке в письме.": "Confirm your email using the link in the message.",
  "Этот email уже зарегистрирован. Попробуйте войти.":
    "This email is already registered. Try signing in.",
  "Слишком много попыток. Подождите и повторите вход.": "Too many attempts. Wait and try again.",
  "Не удалось связаться с сервером входа. Проверьте соединение и повторите попытку.":
    "Could not reach the sign-in server. Check your connection and try again.",
  "Не удалось войти через Google. Повторите вход или используйте email и пароль.":
    "Could not sign in with Google. Try again or use email and password.",
  "Не удалось восстановить сессию. Повторите вход.":
    "Could not restore your session. Sign in again.",
  "Не удалось выполнить вход или регистрацию. Проверьте данные и повторите попытку.":
    "Could not sign in or sign up. Check your details and try again.",
  "Не удалось выйти. Сессия на устройстве сохранена; повторите попытку.":
    "Could not sign out. Your session remains on this device; try again.",
  "На этом устройстве вы вышли, но сервер не подтвердил отзыв сессий на других устройствах. Повторите выход после восстановления соединения.":
    "You signed out on this device, but the server could not confirm revoking sessions on other devices. Try again when connected.",
  "Не удалось подтвердить выход. Приватные данные скрыты; обновите страницу и проверьте сессию при восстановленном соединении.":
    "Could not confirm sign-out. Private data is hidden; reload and check your session when connected.",
  "Архивная история": "Archived history",
  "Активная программа": "Active program",
  "История без активного дня": "History without an active day",
  "Выберите архивный день": "Choose an archived day",
  "Для выбранного дня нет упражнений.": "There are no exercises for this day.",
  "Не удалось загрузить программу для просмотра истории.":
    "Could not load the program for history.",
  "В программе пока нет упражнений.": "The program has no exercises yet.",
  "Загрузка полной истории…": "Loading complete history…",
  "Период графика": "Chart period",
  Показатель: "Metric",
  "График тренировок": "Workout chart",
  "Тренировка для сравнения": "Workout to compare",
  "Нет записей за период": "No entries in this period",
  "Записей пока нет": "No entries yet",
  "С предыдущей сессией": "Versus previous session",
  "С прошлой календарной неделей": "Versus previous calendar week",
  "Нет прошлой записи для сравнения": "No previous entry to compare",
  "Рабочий вес": "Working weight",
  "Сумма повторений": "Total repetitions",
  "Объём, кг × повт.": "Volume, kg × reps",
  Объём: "Volume",
  Вес: "Weight",
  Повторения: "Repetitions",
  Подходы: "Sets",
  кг: "kg",
  "{count} из {max}": "{count} of {max}",
  "Всё время": "All time",
  "Записи за период ({count})": "Entries in period ({count})",
  "Разное число подходов: условия несопоставимы.":
    "Different number of sets: conditions are not comparable.",
  "RIR отличается на 2 или больше: условия несопоставимы.":
    "RIR differs by at least 2: conditions are not comparable.",
  "RIR указан не в обеих записях; усилие нельзя сопоставить полностью.":
    "RIR is missing from one entry; effort cannot be fully compared.",
  "Не удалось загрузить историю тренировок. Расчёты недоступны до полной загрузки.":
    "Could not load workout history. Calculations are unavailable until it finishes loading.",
  "В истории есть некорректные старые результаты. Расчёты остановлены; данные требуют отдельной проверки.":
    "Older history contains invalid results. Calculations have stopped; these entries need review.",
  "За день: максимальный вес; повторения и объём суммируются. Будущие записи исключены.":
    "Daily: maximum weight; repetitions and volume are summed. Future entries are excluded.",
  "Сравнения относятся к выбранной записи и не зависят от периода графика. Несколько сессий в день упорядочены по времени создания и ID.":
    "Comparisons use the selected entry regardless of chart period. Multiple sessions on one day are ordered by creation time and ID.",
  "Объём — вес × сумма повторений. Изменение объёма само по себе не доказывает рост силы. Вес 0 учитывается, процент относительно 0 не определяется.":
    "Volume is weight × total reps. A change in volume alone does not prove strength gain. Weight 0 is included; percent change from 0 is undefined.",
  "Последняя сессия того же упражнения за {from} — {to} (пн–вс).":
    "Last session of this exercise from {from} to {to} (Mon–Sun).",
  "{count} дн": "{count} days",
  "{count} подх. · запись {number}": "{count} sets · entry {number}",
  "{count} подх. · RIR {rir}": "{count} sets · RIR {rir}",
} as const;

export type TranslationKey = keyof typeof english;
export function translate(
  language: Language,
  key: TranslationKey,
  values?: Record<string, string | number>,
) {
  const template: string = language === "ru" ? key : english[key];
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? ""));
}

export function translateKnown(language: Language, message: string) {
  if (language === "ru") return message;
  if (Object.prototype.hasOwnProperty.call(english, message))
    return translate(language, message as TranslationKey);
  const patterns: [RegExp, TranslationKey, (parts: RegExpMatchArray) => Record<string, string>][] =
    [
      [
        /^Название: от 1 до (\d+) символов$/,
        "Название: от 1 до {max} символов",
        (m) => ({ max: m[1]! }),
      ],
      [
        /^Заполните поле «(.+)». Пустое значение не равно нулю\.$/,
        "Заполните поле «{label}». Пустое значение не равно нулю.",
        (m) => ({ label: translateKnown(language, m[1]!) }),
      ],
      [
        /^(.+): введите число, не более (\d+) знаков после запятой\.$/,
        "{label}: введите число, не более {places} знаков после запятой.",
        (m) => ({ label: translateKnown(language, m[1]!), places: m[2]! }),
      ],
      [
        /^(.+): допустимо от 0 до (\d+)\.$/,
        "{label}: допустимо от 0 до {max}.",
        (m) => ({ label: translateKnown(language, m[1]!), max: m[2]! }),
      ],
      [
        /^Допустимо от 1 до (\d+) подходов\.$/,
        "Допустимо от 1 до {max} подходов.",
        (m) => ({ max: m[1]! }),
      ],
      [
        /^Заполните подход (\d+) или явно уберите его кнопкой «Убрать подход»\.$/,
        "Заполните подход {number} или явно уберите его кнопкой «Убрать подход».",
        (m) => ({ number: m[1]! }),
      ],
      [
        /^Подход (\d+): нужно одно целое число. Последовательность 8-8-7-6 вводите в четыре отдельных поля\.$/,
        "Подход {number}: нужно одно целое число. Последовательность 8-8-7-6 вводите в четыре отдельных поля.",
        (m) => ({ number: m[1]! }),
      ],
      [
        /^Подход (\d+): допустимо от 0 до (\d+) повторений\.$/,
        "Подход {number}: допустимо от 0 до {max} повторений.",
        (m) => ({ number: m[1]!, max: m[2]! }),
      ],
    ];
  for (const [pattern, key, values] of patterns) {
    const match = message.match(pattern);
    if (match) return translate(language, key, values(match));
  }
  return message;
}

export function readLanguage(userId: string | null): Language {
  if (typeof window === "undefined") return "ru";
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${userId ?? "guest"}`) === "en" ? "en" : "ru";
  } catch {
    return "ru";
  }
}

export function rememberSignupLanguage(userId: string, language: Language) {
  if (language === "ru" || typeof window === "undefined") return;
  try {
    const key = `${STORAGE_PREFIX}${userId}`;
    if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, language);
      window.dispatchEvent(
        new CustomEvent("app-language-updated", { detail: { userId, language } }),
      );
    }
  } catch {
    // This preference is optional; account creation must still succeed.
  }
}

export function initialDayNames(count: number, language: Language) {
  return defaultDayNames(count).map((name) =>
    language === "en" ? name.replace(/^День /, "Day ") : name,
  );
}

const LanguageContext = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
} | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { userId } = useSession();
  const [selection, setSelection] = useState<{ userId: string | null; language: Language }>({
    userId: null,
    language: "ru",
  });
  // Derive at render time: another account can never see the previous language even briefly.
  const language = selection.userId === userId ? selection.language : readLanguage(userId);
  function setLanguage(next: Language) {
    setSelection({ userId, language: next });
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${userId ?? "guest"}`, next);
    } catch {
      // The current tab still uses the chosen language if storage is unavailable.
    }
  }
  useEffect(() => {
    setSelection({ userId, language: readLanguage(userId) });
  }, [userId]);
  useEffect(() => {
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string; language: Language }>).detail;
      if (detail?.userId === userId) setSelection({ userId, language: detail.language });
    };
    window.addEventListener("app-language-updated", onUpdated);
    return () => window.removeEventListener("app-language-updated", onUpdated);
  }, [userId]);
  useEffect(() => {
    document.documentElement.lang = language;
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifest)
      manifest.href = language === "en" ? "/manifest.en.webmanifest" : "/manifest.webmanifest";
    const appleTitle = document.querySelector<HTMLMetaElement>(
      'meta[name="apple-mobile-web-app-title"]',
    );
    if (appleTitle) appleTitle.content = translate(language, "Прогресс Трекер");
  }, [language]);
  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(LanguageContext);
  const language = context?.language ?? "ru";
  return {
    language,
    setLanguage: context?.setLanguage ?? (() => {}),
    t: (key: TranslationKey, values?: Record<string, string | number>) =>
      translate(language, key, values),
    number: (value: number, maximumFractionDigits = 1) =>
      value.toLocaleString(language === "ru" ? "ru-RU" : "en-GB", { maximumFractionDigits }),
    date: (iso: string) => {
      const [year, month, day] = iso.split("-").map(Number);
      return new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-GB").format(
        new Date(year!, month! - 1, day!),
      );
    },
  };
}

export function exerciseCount(count: number, language: Language) {
  if (language === "en") return `${count} ${count === 1 ? "exercise" : "exercises"}`;
  const lastTwo = count % 100;
  const last = count % 10;
  const noun =
    lastTwo >= 11 && lastTwo <= 14
      ? "упражнений"
      : last === 1
        ? "упражнение"
        : last >= 2 && last <= 4
          ? "упражнения"
          : "упражнений";
  return `${count} ${noun}`;
}

export function setsCount(count: number, language: Language) {
  if (language === "en") return `${count} ${count === 1 ? "set" : "sets"}`;
  const form = new Intl.PluralRules("ru-RU").select(count);
  return `${count} ${form === "one" ? "подход" : form === "few" ? "подхода" : "подходов"}`;
}
