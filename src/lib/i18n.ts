import { createContext, useContext } from "react";
import { defaultDayNames } from "./workout";

export type Language = "ru" | "en";
export const STORAGE_PREFIX = "app:language:v1:";

// Russian source text is the key. Missing English translations fail at typed call sites.
// User-authored names and notes never enter this dictionary.
export const english = {
  "Подход изменён в другом окне. Ваш ввод сохранён; отмените редактирование и откройте актуальную запись.":
    "This set changed in another window. Your input is preserved; cancel editing and reopen the current record.",
  "Версия подхода недоступна. Обновите запись после обновления базы.":
    "The set revision is unavailable. Reload the record after the database upgrade.",
  "Сервер не подтвердил версию подхода. Повторите ту же операцию.":
    "The server did not confirm the set revision. Retry the same operation.",
  "Изменение отклонено или не подтверждено. Ваш ввод сохранён.":
    "The change was rejected or unconfirmed. Your input is preserved.",
  "Прогресс Трекер": "Progress Tracker",
  Настройки: "Settings",
  "Тема оформления": "Appearance",
  Авто: "Auto",
  Светлая: "Light",
  Тёмная: "Dark",
  Закрыть: "Close",
  Уведомления: "Notifications",
  "Закрыть уведомление": "Close notification",
  Перетащить: "Drag",
  "Перетащить подход {number}": "Drag set {number}",
  "Перемещаемый элемент": "Draggable item",
  "Для перемещения нажмите пробел или Enter. Используйте стрелки для выбора позиции. Снова нажмите пробел или Enter, чтобы завершить, или Escape, чтобы отменить.":
    "To pick up an item, press Space or Enter. Use the arrow keys to choose a position. Press Space or Enter again to drop, or Escape to cancel.",
  "Выбран элемент на позиции {position} из {count}.":
    "Picked up item at position {position} of {count}.",
  "Элемент перемещён на позицию {position} из {count}.":
    "Item moved to position {position} of {count}.",
  "Элемент находится вне области перемещения.": "Item is outside the drop area.",
  "Перемещение завершено. Позиция {position} из {count}.":
    "Item dropped at position {position} of {count}.",
  "Перемещение завершено. Позиция не изменилась.": "Item dropped. Position unchanged.",
  "Перемещение отменено. Исходная позиция {position} из {count}.":
    "Drag cancelled. Original position {position} of {count}.",
  "Повторите загрузку или вернитесь на главную. Сохранённые тренировки останутся в вашем аккаунте.":
    "Reload the page or return home. Saved workouts will remain in your account.",
  "Язык интерфейса": "Interface language",
  "Управление данными": "Data management",
  "Разрешить полное удаление": "Enable permanent deletion",
  "Показывать архивные дни и упражнения": "Show archived days and exercises",
  "Автоматически переходить к следующему упражнению": "Automatically switch to the next exercise",
  "После сохранения выбирать следующее упражнение": "Select the next exercise after saving",
  "Выберите тренировочный день": "Select a training day",
  "Выберите упражнение": "Select an exercise",
  "Удалить день: {name}": "Delete day: {name}",
  "Удалить упражнение: {name}": "Delete exercise: {name}",
  "Удалить архивный день?": "Delete archived day?",
  "Удалить архивное упражнение?": "Delete archived exercise?",
  "День «{name}» будет удалён навсегда. Упражнения и вся история сохранятся.":
    "Day ‘{name}’ will be permanently deleted. Exercises and all workout history will remain.",
  "Упражнение «{name}» и вся его история будут удалены без возможности восстановления.":
    "Exercise ‘{name}’ and all its history will be permanently deleted.",
  "Связанных упражнений: {count}": "Linked exercises: {count}",
  "Исторических записей: {count}": "Historical entries: {count}",
  "Подсчёт записей…": "Counting entries…",
  "Не удалось подсчитать записи.": "Could not count entries.",
  "Не удалось удалить. Данные сохранены; проверьте соединение и повторите попытку.":
    "Could not delete. Data was preserved; check your connection and try again.",
  "Результат удаления пока не подтверждён. Проверьте соединение и повторите безопасно.":
    "The deletion result is not confirmed yet. Check your connection and retry safely.",
  "Сервер отклонил удаление. Данные и черновик сохранены.":
    "The server rejected the deletion. Data and draft were preserved.",
  "Удаление пока недоступно на сервере.": "Deletion is not available on the server yet.",
  Отмена: "Cancel",
  "Удалить день": "Delete day",
  "Удалить навсегда": "Delete permanently",
  "Упражнение и его история удалены": "Exercise and its history deleted",
  "День удалён, упражнения и история сохранены": "Day deleted; exercises and history preserved",
  "Упражнение удалено, но локальный черновик очистить не удалось.":
    "Exercise deleted, but its local draft could not be cleared.",
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
  "Дата и тренировочный день": "Date and training day",
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
  "Загружаем готовые шаблоны…": "Loading ready-made templates…",
  "Готовые шаблоны сейчас недоступны. Можно создать пустую программу.":
    "Ready-made templates are currently unavailable. You can create an empty program.",
  "Для выбранного числа дней нет готовых шаблонов. Можно создать пустую программу.":
    "There are no ready-made templates for the selected number of days. You can create an empty program.",
  "Для семидневного режима подтвердите лёгкий день": "Confirm the light day for the seven-day mode",
  "Я выбираю ежедневный режим и понимаю, что седьмой день лёгкий":
    "I choose daily training and understand that day seven is light",
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
  "Архивированных упражнений нет": "No archived exercises",
  "Упражнения без дня": "Exercises without a day",
  "Без назначенного дня · {count}": "Unassigned day · {count}",
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
  "Программа изменена в другом окне. Ввод сохранён; отмените редактирование и откройте его снова.":
    "The program changed in another window. Your input is preserved; cancel editing and reopen it to review the latest version.",
  "Программа изменилась. Обновите страницу и повторите действие.":
    "The program changed. Reload and try again.",
  "Не удалось сохранить изменения. Проверьте соединение и повторите попытку.":
    "Could not save changes. Check your connection and try again.",
  "Повторить создание": "Retry creation",
  "Не удалось сохранить операцию.": "Could not preserve the operation.",
  "Не удалось восстановить незавершённое создание.": "Could not restore the pending creation.",
  "Не удалось сохранить операцию на устройстве. Запрос не отправлен.":
    "Could not save the operation on this device. The request was not sent.",
  "Предыдущее создание ещё не подтверждено. Повторите его с сохранёнными значениями.":
    "The previous creation is not confirmed. Retry it with the saved values.",
  "Идентификатор создания уже занят другими данными. Объект не изменён.":
    "This creation ID belongs to different data. The object was not changed.",
  "Идентификатор создания уже занят. Объект не изменён.":
    "This creation ID is already in use. The object was not changed.",
  "Результат создания не подтверждён. Повторите попытку.":
    "The creation result is not confirmed. Retry the operation.",
  "Сервер отклонил создание. Проверьте данные и доступ.":
    "The server rejected the creation. Check the values and access.",
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
  "Открыть календарь": "Open calendar",
  "Рабочий вес, кг": "Working weight, kg",
  "Укажите вес": "Enter weight",
  "Повторения · подходов: {count}": "Repetitions · sets: {count}",
  "Убрать подход": "Remove set",
  "Добавить подход": "Add set",
  "Повтор сохранения старой записи": "Retry legacy workout save",
  "Восстановлена незавершённая операция старого формата. Повтор отправит сохранённые значения без изменений.":
    "An unfinished legacy operation was restored. Retry sends the original saved values unchanged.",
  "Удалить повреждённый черновик подходов и начать заново?":
    "Delete the damaged set draft and start over?",
  "Не удалось загрузить предыдущую тренировку. Черновик сохранён; можно заполнить форму вручную.":
    "Could not load the previous workout. The draft is saved; you can fill in the form manually.",
  "Предыдущая тренировка загружена по подходам": "Previous workout loaded by set",
  "Подходы · {count}": "Sets · {count}",
  "Убрать последний подход": "Remove last set",
  "Вес, кг": "Weight, kg",
  "Вес подхода {number}": "Set {number} weight",
  "Повторения подхода {number}": "Set {number} reps",
  "RIR подхода {number}": "Set {number} RIR",
  "Тип подхода": "Set type",
  "Тип подхода {number}": "Set {number} type",
  Рабочий: "Working",
  Разминочный: "Warm-up",
  "Тип нагрузки": "Load type",
  "Тип нагрузки {number}": "Set {number} load type",
  "Внешнее отягощение": "External load",
  "Собственный вес + отягощение": "Bodyweight + added load",
  "Доп. вес, кг": "Added weight, kg",
  "Focus Mode": "Focus Mode",
  "Тренируйся без лишних отвлечений. Выполняй упражнения по очереди и записывай результаты сразу после каждого подхода.":
    "Stay focused on your workout. Complete your sets one by one and log your results right after each set.",
  "Режим тренировки": "Workout mode",
  Обычный: "Standard",
  Фокус: "Focus",
  "Подготовка тренировки": "Workout preparation",
  "Добавьте тренировочный день, чтобы начать.": "Add a training day to get started.",
  "Обычный режим": "Standard mode",
  "Начать тренировку": "Start workout",
  Скип: "Skip",
  "Упражнения · {done} из {total}": "Exercises · {done} of {total}",
  "Все упражнения тренировки": "All workout exercises",
  "Выбрать подход": "Choose a set",
  "Выбрать подход {number}": "Choose set {number}",
  "Записать подход": "Record set",
  Выполнено: "Completed",
  "Тренировка завершена": "Workout complete",
  "Все упражнения записаны": "All exercises are saved",
  "Завершить и вернуться": "Finish and return",
  "Вернуться в обычный режим": "Return to standard mode",
  "Текущее упражнение": "Current exercise",
  "Упражнение {number} из {count}": "Exercise {number} of {count}",
  "Предыдущее упражнение": "Previous exercise",
  "Следующее упражнение": "Next exercise",
  "Переместить упражнение для выполнения выше": "Move exercise earlier",
  "Переместить упражнение для выполнения ниже": "Move exercise later",
  "Прогресс подходов": "Set progress",
  "Подход {number} из {count}": "Set {number} of {count}",
  "Записанные подходы": "Recorded sets",
  "Предыдущий подход": "Previous set",
  "Следующий подход": "Next set",
  "Записать подход · далее": "Record set · next",
  "Подход записан · далее": "Set recorded · next",
  "Прошлые результаты по подходам": "Previous results by set",
  "Заполните вес и повторения текущего подхода перед записью.":
    "Enter the current set's weight and reps before recording it.",
  "Макс. рабочий вес {weight}": "Max working weight {weight}",
  "Максимальный рабочий вес": "Maximum working weight",
  "Изменить подход {number}": "Edit set {number}",
  "Сохранить подход {number}": "Save set {number}",
  "Отмена редактирования подхода": "Cancel set edit",
  "Подход обновлён": "Set updated",
  "Лучший рабочий подход · внешнее отягощение": "Best working set · external load",
  "Объём рабочих подходов": "Working-set volume",
  "Рабочие подходы": "Working sets",
  "Показатели подходов": "Set metrics",
  "История RIR": "RIR history",
  "Для упражнений с собственным весом объём учитывает только добавленное отягощение, не массу тела.":
    "For bodyweight exercises, volume includes added load only, not body mass.",
  "Объём считается только по рабочим подходам: сумма веса × повторений. Сам по себе он не доказывает рост силы.":
    "Volume counts working sets only: sum of weight × reps. By itself, it does not prove strength gains.",
  "Рабочие подходы или усилие отличаются: вывод о прогрессии ограничен.":
    "Working sets or effort differ: conclusions about progression are limited.",
  "В каждом поле — повторения одного подхода. Пустой подход нужно заполнить или явно убрать.":
    "Each field is one set. Fill or explicitly remove an empty set.",
  "Подход {number}": "Set {number}",
  "RIR (необязательно)": "RIR (optional)",
  "RIR {min}–{max}": "RIR {min}–{max}",
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
  "Не удалось прочитать черновик подходов. Сохранённые данные не изменены.":
    "Could not read the set draft. Saved data was not changed.",
  "Не удалось восстановить черновик. Сохранённые данные не изменены.":
    "Could not restore the draft. Saved data was not changed.",
  "Не удалось восстановить черновик подходов. Данные не изменены.":
    "Could not restore the set draft. Data was not changed.",
  "Дата черновика не совпадает.": "The draft date does not match.",
  "Повреждена сохранённая операция. Данные не изменены.":
    "The saved operation is damaged. Data was not changed.",
  "Операция относится к другому упражнению.": "The operation belongs to a different exercise.",
  "Данные операции не совпадают с черновиком.": "The operation data does not match the draft.",
  "Повреждена сохранённая операция подходов. Данные не изменены.":
    "The saved set operation is damaged. Data was not changed.",
  "Операция подходов относится к другому упражнению.":
    "The set operation belongs to a different exercise.",
  "Данные операции подходов не совпадают с черновиком.":
    "The set operation does not match the draft.",
  "Повреждён один из подходов черновика. Данные не изменены.":
    "One of the draft sets is damaged. Data was not changed.",
  "В черновике Focus Mode поврежден список подтверждённых подходов.":
    "The Focus Mode draft contains a damaged confirmed-set list.",
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
  "Без назначенного дня": "Unassigned day",
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
  "Этот пароль найден в известных утечках. Выберите другой пароль.":
    "This password appears in known data breaches. Choose a different password.",
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
  "Рабочий вес {weight}": "Working weight {weight}",
  SET: "SET",
  WEIGHT: "WEIGHT",
  REPS: "REPS",
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
  "Подход больше недоступен. История обновлена; проверьте запись.":
    "This set is no longer available. History was refreshed; check the entry.",
  "Операция конфликтует с уже сохранёнными значениями.":
    "This operation conflicts with values already saved.",
  "Изменение отклонено. Проверьте значения и доступность записи.":
    "The change was rejected. Check the values and whether the entry is available.",
  "Результат изменения не подтверждён. Повторите ту же операцию.":
    "The change was not confirmed. Retry the same operation.",
  "Результат изменения подходов не подтверждён. Повторите ту же операцию.":
    "The set change was not confirmed. Retry the same operation.",
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
  const template: string = language === "ru" ? key : (english[key] ?? key);
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? ""));
}

export function translateKnown(language: Language, message: string) {
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
  return language === "ru"
    ? "Произошла ошибка. Повторите попытку."
    : "Something went wrong. Please try again.";
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

export const LanguageContext = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
} | null>(null);

export function formatDisplayDate(iso: string, language: Language) {
  const [year, month, day] = iso.split("-").map(Number);
  const parsed = new Date(year!, month! - 1, day!);
  // Old drafts can contain incomplete input; displaying them must not throw or normalize it.
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(iso) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month! - 1 ||
    parsed.getDate() !== day
  )
    return iso;
  return new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-GB").format(parsed);
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
    date: (iso: string) => formatDisplayDate(iso, language),
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
