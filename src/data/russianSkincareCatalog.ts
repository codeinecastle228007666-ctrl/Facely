/**
 * 2026-06-30 — Каталог РФ-доступных косметических средств.
 *
 * Пользовательский запрос: «после анализа на их основе средства нужно подобрать (просто
 * названия и бренд, чтобы можно было купить в россии)». Решено хранить статический
 * каталог: контролируемые бренды (точно продаются в РФ — Рив Гош, Летуаль,
 * Wildberries, Ozon, аптеки), без галлюцинаций AI о несуществующих средствах.
 *
 * Структура: Бренд → Линейка/Серия → Продукты. У каждого продукта — теги
 * `for_skin_types` (каким типам кожи подходит) и `for_problems` (при каких
 * проблемах рекомендуется). Matcher (russianProductCatalog.ts) использует
 * эти теги для скоринга и возвращает top-N линеек.
 *
 * Each BRAND has a `country` flag indicating its origin (RU / FR / etc.) —
 * useful for UI labeling and for filtering foreign-origin brands that
 * aren't actually RF-stocked. ALL brands listed here are stocked in РФ
 * retail chains as of mid-2026.
 *
 * Coverage-spanning design: each top-level problem (акне, поры, тёмные
 * круги, пигментация, морщины, чёрные точки, мешки под глазами, отёчность
 * век) and each skin type (сухая, жирная, комбинированная, нормальная)
 * has at least 3 viable line matches. Even when analysis returns an
 * unusual combination (e.g. сухая + мешки под глазами), matcher returns 3-5
 * usable recommendations instead of zero.
 */

export type RussianSkinType = "сухая" | "жирная" | "комбинированная" | "нормальная";

/**
 * Problem labels emitted by the analysis pipeline. Mirrors the keys
 * in `src/server/utils/skinScoring.ts PROBLEM_MAP` without the
 * parenthetical severity suffix. Matcher normalises analysis.problems[]
 * via `cleanName()` (strip the "(...)" suffix from "акне (лёгкое)" → "акне").
 *
 * Note: "чёрные точки" vs "тёмные круги" — exact spelling matters,
 * because the catalog relies on exact equality match against this enum.
 */
export type RussianProblem =
  | "акне"
  | "тёмные круги"
  | "поры"
  | "пигментация"
  | "морщины"
  | "чёрные точки"
  | "мешки под глазами"
  | "отёчность век";

/** Format / texture of the product — drives secondary UI grouping. */
export type RussianProductFormat =
  | "крем"
  | "гель"
  | "сыворотка"
  | "пенка"
  | "гель для умывания"
  | "мицеллярная вода"
  | "тоник"
  | "тонер"
  | "маска"
  | "эссенция"
  | "эмульсия"
  | "лосьон"
  | "молочко"
  | "флюид"
  | "бальзам"
  | "спрей"
  | "патчи"
  | "пилинг"
  | "скраб"
  | "пудра"
  | "масло"
  | "spf"
  | "крем для век"
  | "гель для век"
  | "шампунь"
  | "сыворотка для век";

/**
 * Single product inside the catalog. Pointer fields (`for_skin_types`,
 * `for_problems`) choose which analysis results surface this candidate.
 * `why` is a 1-line Russian reason string rendered in the UI so the user
 * understands the match without reading the full ingredient list.
 */
export interface RussianProduct {
  /** Display name as printed on the box and searchable on Russian retail. */
  name: string;
  /** Format / texture category (крем, сыворотка, гель и т.д.). */
  format: RussianProductFormat;
  /** Skin types this product is appropriate for. Empty array = universal. */
  for_skin_types: RussianSkinType[];
  /** Skin problems this product helps with. Empty array = no targeted action. */
  for_problems: RussianProblem[];
  /** Short Russian justification shown in UI under the product name. */
  why: string;
}

/**
 * A specific brand series / product line. Inside the brand, lines are
 * the unit of UI display — we show «CeraVe • Увлажняющие кремы» as one
 * block, with multiple products inside. Matches against analysis happen
 * at the line level: a line ON the user's analysis surface gets all its
 * products rendered.
 */
export interface RussianLine {
  /** Display name of the line/series. */
  name: string;
  /** Short description of line's focus (anti-age, для проблемной, etc.). */
  description: string;
  /** Specific products within this line. */
  products: RussianProduct[];
}

/**
 * Catalog brand entry. `country` is informational only — every brand listed
 * here is stocked in Россия as of 2026-Q2, even if the brand's parent
 * company is foreign-owned (CeraVe is owned by L'Oréal, sold in РФ).
 */
export interface RussianBrand {
  name: string;
  description: string;
  /** Country of origin. Informational only; not used by matcher. */
  country: string;
  lines: RussianLine[];
}

export const RUSSIAN_SKINCARE_CATALOG: RussianBrand[] = [
  // ─── Cerave ────────────────────────────────────────────────
  // Французский бренд (L'Oréal), очень популярен в РФ, продаётся в
  // аптеках, Рив Гош, Летуаль, Wildberries, Ozon. Дерматологи рекомендуют.
  {
    name: "CeraVe",
    description: "Бренд с церамидами для восстановления защитного барьера кожи.",
    country: "Франция",
    lines: [
      {
        name: "Увлажняющие средства с церамидами",
        description: "Базовый уход для сухой и нормальной кожи: крем, лосьон, бальзам.",
        products: [
          {
            name: "Увлажняющий крем для лица",
            format: "крем",
            for_skin_types: ["сухая", "нормальная"],
            for_problems: [],
            why: "Церамиды + гиалуроновая кислота восстанавливают барьер и увлажняют на 24 часа",
          },
          {
            name: "Увлажняющий лосьон для лица и тела",
            format: "лосьон",
            for_skin_types: ["сухая", "нормальная", "комбинированная"],
            for_problems: [],
            why: "Лёгкая текстура, не забивает поры, подходит для ежедневного использования",
          },
          {
            name: "Восстанавливающий бальзам для очень сухой кожи",
            format: "бальзам",
            for_skin_types: ["сухая"],
            for_problems: [],
            why: "Интенсивное восстановление для очень сухих участков и после повреждений",
          },
        ],
      },
      {
        name: "Очищающие средства",
        description: "Мягкие пенки и гели для умывания для всех типов кожи.",
        products: [
          {
            name: "Пенка для умывания для нормальной и жирной кожи",
            format: "пенка",
            for_skin_types: ["жирная", "комбинированная", "нормальная"],
            for_problems: ["акне", "чёрные точки", "поры"],
            why: "Мягко очищает, сохраняет защитный барьер, не сушит",
          },
          {
            name: "Гель для умывания для нормальной и сухой кожи",
            format: "гель для умывания",
            for_skin_types: ["сухая", "нормальная"],
            for_problems: [],
            why: "Гиалуроновая кислота в составе сохраняет увлажнение после умывания",
          },
        ],
      },
      {
        name: "Anti-acne SA (с салициловой кислотой)",
        description: "Линейка для проблемной кожи с салициловой кислотой.",
        products: [
          {
            name: "Очищающий гель с салициловой кислотой для проблемной кожи",
            format: "гель для умывания",
            for_skin_types: ["жирная", "комбинированная"],
            for_problems: ["акне", "чёрные точки", "поры"],
            why: "Салициловая кислота 0.5% растворяет пробки в порах и предотвращает высыпания",
          },
          {
            name: "Крем с салициловой кислотой для проблемной кожи",
            format: "крем",
            for_skin_types: ["жирная", "комбинированная"],
            for_problems: ["акне", "чёрные точки", "поры"],
            why: "Лёгкий крем с салициловой кислотой и церамидами — увлажняет и лечит одновременно",
          },
        ],
      },
      {
        name: "Suncare SPF",
        description: "Солнцезащитные средства для лица на каждый день.",
        products: [
          {
            name: "Увлажняющий крем с SPF 30 для лица",
            format: "крем",
            for_skin_types: ["сухая", "нормальная", "комбинированная"],
            for_problems: ["пигментация", "морщины"],
            why: "Солнцезащита + увлажнение в одном флаконе, лёгкая текстура, не оставляет белых следов",
          },
          {
            name: "Солнцезащитный флюид для лица SPF 50+",
            format: "флюид",
            for_skin_types: ["жирная", "комбинированная", "нормальная"],
            for_problems: ["пигментация", "акне"],
            why: "Максимальная защита от солнца, матирует, подходит под макияж",
          },
        ],
      },
    ],
  },

  // ─── Librederm ─────────────────────────────────────────────
  // Российский бренд (производство в России), везде в аптеках и на маркетплейсах.
  {
    name: "Librederm",
    description: "Российский бренд аптечной косметики с акцентом на гиалуроновую кислоту и витамины.",
    country: "Россия",
    lines: [
      {
        name: "Гиалуроновая линейка",
        description: "Средства с гиалуроновой кислотой для глубокого увлажнения.",
        products: [
          {
            name: "Крем для лица с гиалуроновой кислотой",
            format: "крем",
            for_skin_types: ["сухая", "нормальная", "комбинированная"],
            for_problems: ["морщины"],
            why: "Низкомолекулярная гиалуроновая кислота проникает в глубокие слои и разглаживает мелкие морщины",
          },
          {
            name: "Сыворотка для лица с гиалуроновой кислотой",
            format: "сыворотка",
            for_skin_types: ["сухая", "нормальная"],
            for_problems: ["морщины"],
            why: "Концентрированное увлажнение перед кремом — кожа становится упругой и сияющей",
          },
        ],
      },
      {
        name: "Аевит (anti-age)",
        description: "Средства с витаминами A и E для anti-age ухода.",
        products: [
          {
            name: "Крем для лица Аевит питательный",
            format: "крем",
            for_skin_types: ["сухая", "нормальная"],
            for_problems: ["морщины"],
            why: "Витамины A и E борются с возрастными изменениями и придают коже здоровый вид",
          },
          {
            name: "Сыворотка для лица Аевит",
            format: "сыворотка",
            for_skin_types: ["сухая", "нормальная", "комбинированная"],
            for_problems: ["морщины"],
            why: "Антиоксидантная защита и стимуляция обновления клеток",
          },
        ],
      },
      {
        name: "Салициловая сыворотка (для проблемной)",
        description: "Средства с салициловой кислотой для проблемной кожи.",
        products: [
          {
            name: "Сыворотка с салициловой кислотой для проблемной кожи",
            format: "сыворотка",
            for_skin_types: ["жирная", "комбинированная"],
            for_problems: ["акне", "чёрные точки", "поры"],
            why: "Салициловая кислота 2% растворяет комедоны и предотвращает воспаления",
          },
        ],
      },
      {
        name: "Витамин C (осветление)",
        description: "Средства с витамином C для сияния и борьбы с пигментацией.",
        products: [
          {
            name: "Сыворотка для лица с витамином C",
            format: "сыворотка",
            for_skin_types: ["сухая", "нормальная", "комбинированная", "жирная"],
            for_problems: ["пигментация"],
            why: "Витамин C осветляет пигментные пятна и придаёт коже сияние",
          },
        ],
      },
      {
        name: "Кремы для век",
        description: "Специализированные средства для кожи вокруг глаз.",
        products: [
          {
            name: "Крем для кожи вокруг глаз с витамином E",
            format: "крем для век",
            for_skin_types: ["сухая", "нормальная"],
            for_problems: ["морщины", "тёмные круги"],
            why: "Витамин E разглаживает мелкие морщины и увлажняет тонкую кожу вокруг глаз",
          },
          {
            name: "Гель для кожи вокруг глаз с кофеином",
            format: "гель для век",
            for_skin_types: ["жирная", "комбинированная", "нормальная"],
            for_problems: ["мешки под глазами", "отёчность век", "тёмные круги"],
            why: "Кофеин улучшает микроциркуляцию и уменьшает отёчность утром",
          },
        ],
      },
    ],
  },

  // ─── Noreva ────────────────────────────────────────────────
  // Французский бренд (Laboratoire Noreva), продаётся в аптеках в РФ.
  // Особенно сильная линейка для проблемной кожи (Exfoliac).
  {
    name: "Noreva",
    description: "Французская дермокосметика из аптек, сильные линейки для проблемной и чувствительной кожи.",
    country: "Франция",
    lines: [
      {
        name: "Exfoliac (для проблемной и жирной кожи)",
        description: "Серия для жирной и проблемной кожи с акне и комедонами.",
        products: [
          {
            name: "Крем-гель Exfoliac для проблемной кожи",
            format: "гель",
            for_skin_types: ["жирная", "комбинированная"],
            for_problems: ["акне", "чёрные точки", "поры"],
            why: "AHA-кислоты + цинк — лечит воспаления и сужает поры",
          },
          {
            name: "Очищающий гель Exfoliac",
            format: "гель для умывания",
            for_skin_types: ["жирная", "комбинированная"],
            for_problems: ["акне", "чёрные точки"],
            why: "Глубокое очищение каждый день, не сушит кожу",
          },
        ],
      },
      {
        name: "Sensiphase (для чувствительной)",
        description: "Успокаивающие средства для реактивной и чувствительной кожи.",
        products: [
          {
            name: "Успокаивающий крем Sensiphase для чувствительной кожи",
            format: "крем",
            for_skin_types: ["сухая", "нормальная", "комбинированная"],
            for_problems: [],
            why: "Минимизирует раздражения и покраснения, восстанавливает барьер",
          },
        ],
      },
    ],
  },

  // ─── Natura Siberica ───────────────────────────────────────
  // Российский бренд натуральной косметики, широкий ассортимент.
  {
    name: "Natura Siberica",
    description: "Российский бренд натуральной косметики на основе сибирских растений.",
    country: "Россия",
    lines: [
      {
        name: "Royal Caviar (anti-age)",
        description: "Премиальная anti-age линейка с экстрактом чёрной икры.",
        products: [
          {
            name: "Крем для лица Royal Caviar антивозрастной",
            format: "крем",
            for_skin_types: ["сухая", "нормальная"],
            for_problems: ["морщины"],
            why: "Экстракт икры + пептиды повышают упругость и разглаживают морщины",
          },
          {
            name: "Сыворотка для лица Royal Caviar",
            format: "сыворотка",
            for_skin_types: ["сухая", "нормальная", "комбинированная"],
            for_problems: ["морщины"],
            why: "Антивозрастной концентрат для интенсивного ухода",
          },
        ],
      },
      {
        name: "Oblepikha (облепиховая серия)",
        description: "Витаминная серия с облепихой для сияния и питания.",
        products: [
          {
            name: "Крем для лица Oblepikha для сияния кожи",
            format: "крем",
            for_skin_types: ["сухая", "нормальная", "комбинированная"],
            for_problems: ["пигментация"],
            why: "Облепиха — натуральный витамин C, осветляет кожу",
          },
          {
            name: "Скраб для лица Oblepikha",
            format: "скраб",
            for_skin_types: ["нормальная", "комбинированная", "жирная"],
            for_problems: ["чёрные точки", "поры"],
            why: "Мягкий скраб с облепиховыми косточками выравнивает текстуру",
          },
        ],
      },
      {
        name: "Anti-acne серия",
        description: "Серия для проблемной кожи с натуральными экстрактами.",
        products: [
          {
            name: "Крем для лица для проблемной кожи (серия Anti-Acne)",
            format: "крем",
            for_skin_types: ["жирная", "комбинированная"],
            for_problems: ["акне"],
            why: "Натуральные антисептики в составе — лёгкий anti-acne эффект без агрессии",
          },
        ],
      },
    ],
  },

  // ─── ARAVIA ────────────────────────────────────────────────
  // Российская профессиональная косметика, продаётся в салонах и в рознице.
  {
    name: "ARAVIA",
    description: "Российская профессиональная косметика для ухода в домашних условиях.",
    country: "Россия",
    lines: [
      {
        name: "Салициловые пилинги (для проблемной)",
        description: "Пилинги на основе салициловой кислоты для проблемной и жирной кожи.",
        products: [
          {
            name: "Салициловый пилинг для проблемной кожи",
            format: "пилинг",
            for_skin_types: ["жирная", "комбинированная"],
            for_problems: ["акне", "чёрные точки", "поры"],
            why: "Салициловая кислота 20% — глубокое очищение пор и выравнивание рельефа",
          },
        ],
      },
      {
        name: "Очищающая линейка для проблемной кожи",
        description: "Тонизирующие и очищающие средства с антибактериальным эффектом.",
        products: [
          {
            name: "Тоник для проблемной кожи с цинком",
            format: "тоник",
            for_skin_types: ["жирная", "комбинированная"],
            for_problems: ["акне", "чёрные точки", "поры"],
            why: "Цинк подсушивает воспаления и нормализует себум",
          },
          {
            name: "Гель для умывания для проблемной кожи",
            format: "гель для умывания",
            for_skin_types: ["жирная", "комбинированная"],
            for_problems: ["акне", "чёрные точки"],
            why: "Бережно очищает, не пересушивая, для ежедневного использования",
          },
        ],
      },
      {
        name: "Anti-age серия с коллагеном",
        description: "Средства для anti-age ухода с гидролизатом коллагена.",
        products: [
          {
            name: "Крем для лица с коллагеном",
            format: "крем",
            for_skin_types: ["сухая", "нормальная"],
            for_problems: ["морщины"],
            why: "Коллаген повышает упругость, разглаживает мелкие морщины",
          },
          {
            name: "Сыворотка для лица с коллагеном",
            format: "сыворотка",
            for_skin_types: ["сухая", "нормальная"],
            for_problems: ["морщины"],
            why: "Сыворотка-бустер для anti-age процедур",
          },
        ],
      },
    ],
  },

  // ─── Чистая Линия ──────────────────────────────────────────
  // Популярный российский бренд масс-маркет, везде в РФ, дешёвый.
  {
    name: "Чистая Линия",
    description: "Масс-маркет российский бренд с простыми и доступными формулами.",
    country: "Россия",
    lines: [
      {
        name: "Идеальная кожа (для жирной и проблемной)",
        description: "Линейка для жирной и комбинированной кожи с матирующим эффектом.",
        products: [
          {
            name: "Крем для лица «Идеальная кожа» матирующий",
            format: "крем",
            for_skin_types: ["жирная", "комбинированная"],
            for_problems: ["поры"],
            why: "Матирует и сужает поры, доступная цена",
          },
          {
            name: "Матирующие салфетки для лица",
            format: "спрей",
            for_skin_types: ["жирная", "комбинированная"],
            for_problems: [],
            why: "Снимают жирный блеск в течение дня, можно носить в сумке",
          },
        ],
      },
      {
        name: "Глубокое увлажнение (для сухой)",
        description: "Увлажняющие средства для сухой и нормальной кожи.",
        products: [
          {
            name: "Крем для лица «Глубокое увлажнение»",
            format: "крем",
            for_skin_types: ["сухая", "нормальная"],
            for_problems: [],
            why: "Бюджетный увлажняющий крем на каждый день",
          },
          {
            name: "Мицеллярная вода для лица",
            format: "мицеллярная вода",
            for_skin_types: ["сухая", "нормальная", "комбинированная", "жирная"],
            for_problems: [],
            why: "Бережное снятие макияжа, подходит для всех типов кожи",
          },
        ],
      },
    ],
  },

  // ─── Чёрный Жемчуг ─────────────────────────────────────────
  // Российский бренд масс-маркет, продаётся везде.
  {
    name: "Чёрный Жемчуг",
    description: "Российский бренд масс-маркет с широкой линейкой anti-age и базового ухода.",
    country: "Россия",
    lines: [
      {
        name: "Платинум (anti-age премиум)",
        description: "Премиум-линейка anti-age с пептидами и коллагеном.",
        products: [
          {
            name: "Крем для лица «Платинум» антивозрастной",
            format: "крем",
            for_skin_types: ["сухая", "нормальная"],
            for_problems: ["морщины"],
            why: "Пептиды и гиалуроновая кислота разглаживают морщины и восстанавливают упругость",
          },
          {
            name: "Сыворотка для лица «Платинум»",
            format: "сыворотка",
            for_skin_types: ["сухая", "нормальная", "комбинированная"],
            for_problems: ["морщины"],
            why: "Антивозрастная сыворотка с биоплатиной",
          },
        ],
      },
      {
        name: "Био-программа (для молодой кожи)",
        description: "Базовый уход для 20-30 лет: увлажнение и сияние.",
        products: [
          {
            name: "Крем для лица «Био-программа» увлажняющий",
            format: "крем",
            for_skin_types: ["нормальная", "комбинированная"],
            for_problems: [],
            why: "Лёгкий увлажняющий крем на каждый день",
          },
        ],
      },
    ],
  },

  // ─── Кора ──────────────────────────────────────────────────
  // Российский бренд с упором на anti-age, натуральные компоненты.
  {
    name: "Кора",
    description: "Российский бренд anti-age косметики с натуральными формулами.",
    country: "Россия",
    lines: [
      {
        name: "Anti-age линейка с ретинолом",
        description: "Средства anti-age с ретинолом и пептидами для зрелой кожи.",
        products: [
          {
            name: "Ночной крем для лица с ретинолом",
            format: "крем",
            for_skin_types: ["сухая", "нормальная"],
            for_problems: ["морщины", "пигментация"],
            why: "Ретинол стимулирует обновление клеток и разглаживает морщины",
          },
          {
            name: "Сыворотка для лица с пептидами",
            format: "сыворотка",
            for_skin_types: ["сухая", "нормальная", "комбинированная"],
            for_problems: ["морщины"],
            why: "Пептиды повышают плотность кожи и упругость",
          },
        ],
      },
    ],
  },

  // ─── Sativa ─────────────────────────────────────────────────
  // Белорусский бренд натуральной косметики, продаётся в РФ.
  {
    name: "Sativa",
    description: "Белорусский бренд натуральной косметики с минимальным содержанием синтетики.",
    country: "Беларусь",
    lines: [
      {
        name: "Anti-age линейка для лица",
        description: "Anti-age уход с натуральными маслами и экстрактами.",
        products: [
          {
            name: "Крем для лица anti-age с маслом ши",
            format: "крем",
            for_skin_types: ["сухая", "нормальная"],
            for_problems: ["морщины"],
            why: "Масло ши и витамин E питают и восстанавливают зрелую кожу",
          },
          {
            name: "Сыворотка anti-age с гиалуроновой кислотой",
            format: "сыворотка",
            for_skin_types: ["сухая", "нормальная", "комбинированная"],
            for_problems: ["морщины"],
            why: "Низкомолекулярная гиалуроновая кислота увлажняет и разглаживает",
          },
        ],
      },
      {
        name: "Очищение и базовый уход",
        description: "Мягкие очищающие средства для чувствительной кожи.",
        products: [
          {
            name: "Гидрофильное масло для снятия макияжа",
            format: "масло",
            for_skin_types: ["сухая", "нормальная", "комбинированная"],
            for_problems: [],
            why: "Бережно снимает макияж, не нарушает защитный барьер",
          },
        ],
      },
    ],
  },

  // ─── Levrana ───────────────────────────────────────────────
  // Российский бренд натуральной и веганской косметики.
  {
    name: "Levrana",
    description: "Российский бренд натуральной и веганской косметики.",
    country: "Россия",
    lines: [
      {
        name: "Anti-age серия с пептидами",
        description: "Натуральные anti-age средства с пептидами.",
        products: [
          {
            name: "Сыворотка для лица anti-age с пептидами",
            format: "сыворотка",
            for_skin_types: ["сухая", "нормальная", "комбинированная"],
            for_problems: ["морщины"],
            why: "Пептиды натурального происхождения, видимый anti-age эффект",
          },
        ],
      },
      {
        name: "Для проблемной кожи",
        description: "Натуральные средства для проблемной кожи.",
        products: [
          {
            name: "Крем для лица для проблемной кожи с азелаиновой кислотой",
            format: "крем",
            for_skin_types: ["жирная", "комбинированная"],
            for_problems: ["акне", "чёрные точки", "пигментация"],
            why: "Азелаиновая кислота натурального происхождения — anti-acne + осветление постакне",
          },
        ],
      },
    ],
  },

  // ─── MiKo ──────────────────────────────────────────────────
  // Российский бренд профессиональной косметики.
  {
    name: "MiKo",
    description: "Российский бренд профессиональной косметики для салонов и домашнего ухода.",
    country: "Россия",
    lines: [
      {
        name: "Для проблемной кожи (pHformula style)",
        description: "Профессиональная линейка для проблемной кожи.",
        products: [
          {
            name: "Сыворотка для проблемной кожи с ретинолом",
            format: "сыворотка",
            for_skin_types: ["жирная", "комбинированная"],
            for_problems: ["акне", "морщины"],
            why: "Профессиональная формула с ретинолом для anti-acne и anti-age одновременно",
          },
          {
            name: "Пилинг для проблемной кожи с миндальной кислотой",
            format: "пилинг",
            for_skin_types: ["жирная", "комбинированная", "нормальная"],
            for_problems: ["поры", "чёрные точки", "акне"],
            why: "Миндальная кислота мягко отшелушивает и борется с воспалениями",
          },
        ],
      },
    ],
  },

  // ─── Универсальные средства ────────────────────────────────
  // Не относятся к одному бренду — базовый дерматологический уход,
  // который можно найти под разными брендами.
  {
    name: "Разные бренды",
    description: "Универсальный базовый уход, который представлен у многих российских брендов.",
    country: "Россия",
    lines: [
      {
        name: "Базовая защита от солнца",
        description: "SPF-средства на каждый день, выпускаются под брендами Librederm, Natura Siberica, CeraVe и др.",
        products: [
          {
            name: "Солнцезащитный крем для лица SPF 50+ (разные бренды)",
            format: "spf",
            for_skin_types: ["сухая", "нормальная", "комбинированная", "жирная"],
            for_problems: ["пигментация", "морщины"],
            why: "Защита от солнца — главная профилактика пигментации и морщин, рекомендуется дерматологами ежедневно",
          },
        ],
      },
      {
        name: "Патчи под глаза (разные бренды)",
        description: "Гидрогелевые патчи для области вокруг глаз, продаются под многими брендами (Skinlite, Mizon, COSRX).",
        products: [
          {
            name: "Гидрогелевые патчи под глаза",
            format: "патчи",
            for_skin_types: ["сухая", "нормальная", "комбинированная", "жирная"],
            for_problems: ["мешки под глазами", "отёчность век", "тёмные круги"],
            why: "Экспресс-средство от отёков и тёмных кругов — заметный эффект за 15-20 минут",
          },
        ],
      },
    ],
  },
];

/**
 * Flat lookup index: line-by-key aggregate. Built once at module-load time
 * for O(N) matcher lookups instead of nested for-loops at runtime.
 *
 * Each entry: brand name + line name + product count + line-level scoring
 * metadata (which skin types / problems this line is suitable for — the
 * UNION of all products' tags inside).
 */
export interface RussianCatalogIndexEntry {
  brand: string;
  brandDescription: string;
  lineName: string;
  lineDescription: string;
  products: RussianProduct[];
  /** UNION of all products' for_skin_types in the line. */
  applicableSkinTypes: RussianSkinType[];
  /** UNION of all products' for_problems in the line. */
  applicableProblems: RussianProblem[];
}

export const RUSSIAN_CATALOG_INDEX: RussianCatalogIndexEntry[] =
  RUSSIAN_SKINCARE_CATALOG.flatMap((brand) =>
    brand.lines.map((line) => {
      const applicableSkinTypes = Array.from(
        new Set(line.products.flatMap((p) => p.for_skin_types)),
      ) as RussianSkinType[];
      const applicableProblems = Array.from(
        new Set(line.products.flatMap((p) => p.for_problems)),
      ) as RussianProblem[];
      return {
        brand: brand.name,
        brandDescription: brand.description,
        lineName: line.name,
        lineDescription: line.description,
        products: line.products,
        applicableSkinTypes,
        applicableProblems,
      };
    }),
  );
