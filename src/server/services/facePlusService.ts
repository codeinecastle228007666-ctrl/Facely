interface FacePlusItem {
  confidence: number;
  value: number;
}

interface FacePlusResult {
  acne: FacePlusItem;
  dark_circle: FacePlusItem;
  skin_spot: FacePlusItem;
  pores_left_cheek: FacePlusItem;
  pores_right_cheek: FacePlusItem;
  pores_forehead: FacePlusItem;
  pores_jaw: FacePlusItem;
  nasolabial_fold: FacePlusItem;
  forehead_wrinkle: FacePlusItem;
  glabella_wrinkle: FacePlusItem;
  crows_feet: FacePlusItem;
  eye_finelines: FacePlusItem;
  eye_pouch: FacePlusItem;
  left_eyelids: FacePlusItem;
  right_eyelids: FacePlusItem;
  blackhead: FacePlusItem;
  mole: FacePlusItem;
  skin_type: {
    details: Record<string, FacePlusItem>;
    skin_type: number;
  };
}

interface FacePlusResponse {
  result: FacePlusResult;
  face_rectangle: { left: number; top: number; width: number; height: number };
  error_message?: string;
  time_used: number;
}

const SKIN_TYPE_MAP: Record<number, string> = {
  0: "сухая",
  1: "жирная",
  2: "комбинированная",
  3: "нормальная",
};

const PROBLEM_MAP: Record<string, string> = {
  acne: "акне",
  dark_circle: "тёмные круги",
  pore: "поры",
  spot: "пигментация",
  wrinkle: "морщины",
  blackhead: "чёрные точки",
  eye_pouch: "мешки под глазами",
  eyelids: "отёчность век",
};

const SEVERITY_LABELS: Record<number, string> = {
  60: "лёгкое",
  100: "выраженное",
};

const PROBLEM_DESC: Record<string, string> = {
  acne: "Воспалительные элементы на коже: чёрные точки, папулы, пустулы. Могут быть вызваны гормональными изменениями, неправильным уходом или питанием.",
  dark_circle: "Потемнение кожи под глазами. Причины: нарушение микроциркуляции, недостаток сна, генетическая предрасположенность, истончение кожи.",
  pore: "Расширенные поры — результат избыточной выработки себума и снижения упругости стенок пор. Чаще встречаются в Т-зоне.",
  spot: "Участки гиперпигментации: постакне, солнечные пятна, мелазма. Возникают из-за избыточной выработки меланина под воздействием УФ.",
  wrinkle: "Мимические и возрастные морщины. Появляются из-за снижения выработки коллагена и эластина, обезвоженности, воздействия УФ.",
  blackhead: "Открытые комедоны — результат закупорки пор кожным салом и ороговевшими клетками. Чаще встречаются в Т-зоне.",
  eye_pouch: "Припухлость под глазами: задержка жидкости, усталость, возрастные изменения, нарушение лимфотока.",
  eyelids: "Отёчность век — скопление жидкости в тканях вокруг глаз. Причины: усталость, недосып, задержка соли.",
};

const RECOMMENDATIONS_MAP: Record<string, string[]> = {
  acne: [
    "Сыворотка с салициловой кислотой 2% для проблемной кожи",
    "Лёгкий гель с цинком для успокоения воспалений",
    "Маска с глиной для глубокого очищения пор",
  ],
  dark_circle: [
    "Крем для кожи вокруг глаз с кофеином",
    "Патчи под глаза с гиалуроновой кислотой",
    "Сыворотка с витамином C для осветления",
  ],
  pore: [
    "Сыворотка с ниацинамидом 5% для сужения пор",
    "Энзимная пудра для мягкого отшелушивания",
    "Тонер с AHA-кислотами для выравнивания текстуры",
  ],
  spot: [
    "Сыворотка с витамином C для осветления пигментации",
    "Крем с ретинолом для обновления кожи",
    "SPF 50+ ежедневно для защиты от фотостарения",
  ],
  wrinkle: [
    "Крем с ретинолом для стимуляции коллагена",
    "Сыворотка с пептидами для упругости кожи",
    "Увлажняющий крем с коэнзимом Q10",
  ],
  blackhead: [
    "Сыворотка с салициловой кислотой 2%",
    "Энзимная пудра для умывания",
    "Маска с глиной 2 раза в неделю",
  ],
  eye_pouch: [
    "Крем для век с кофеином",
    "Патчи с гидрогелем под глаза",
    "Лимфодренажный массаж лица",
  ],
  eyelids: [
    "Лёгкий гель для век с экстрактом огурца",
    "Патчи с зелёным чаем для снятия отёчности",
    "Ограничить солёное на ночь",
  ],
};

function buildRoutine(
  skinType: string,
  problems: string[],
  hasAcne: boolean,
): string {
  const parts: string[] = [];

  parts.push(
    hasAcne
      ? "Очищение: мягкий гель с салициловой кислотой"
      : "Очищение: мягкая пенка для умывания",
  );
  parts.push("Тонизирование: успокаивающий тонер без спирта");

  if (problems.includes("морщины")) {
    parts.push("Сыворотка: увлажняющая с гиалуроновой кислотой");
  }
  if (problems.includes("акне") || problems.includes("поры")) {
    parts.push("Сыворотка: матирующая с ниацинамидом");
  }
  if (problems.includes("пигментация")) {
    parts.push("Сыворотка: с витамином C");
  }

  if (skinType === "жирная" || skinType === "комбинированная") {
    parts.push("Увлажнение: лёгкий гелевый крем");
  } else {
    parts.push("Увлажнение: питательный крем");
  }
  parts.push("Защита: SPF 50+ ежедневно");

  const morning = parts.join(" → ");
  const evening: string[] = [];

  evening.push("Демакияж: мицеллярная вода");
  evening.push(hasAcne ? "Умывание: гель с салициловой кислотой" : "Умывание: мягкая пенка");
  evening.push("Тонизирование");
  if (problems.includes("пигментация") || problems.includes("морщины")) {
    evening.push("Сыворотка: с ретинолом (через день)");
  }
  evening.push("Ночной крем: питательный с церамидами");

  return `Утром: ${morning}\nВечером: ${evening.join(" → ")}`;
}

function determineMood(
  problems: string[],
): "позитивный" | "нейтральный" | "тревожный" {
  if (problems.length >= 3) return "тревожный";
  if (problems.length >= 1) return "нейтральный";
  return "позитивный";
}

function generateProductLinks(
  problems: string[],
): Array<{ name: string; reason: string; effect: string }> {
  const PRODUCTS: Record<string, Array<{ name: string; reason: string; effect: string }>> = {
    акне: [
      { name: "Сыворотка с салициловой кислотой 2%", reason: "Глубоко очищает поры и уменьшает воспаления", effect: "Через 2 недели воспаления станут заметно меньше, кожа успокоится" },
      { name: "Гель с цинком", reason: "Успокаивает и подсушивает высыпания", effect: "Новые прыщи будут появляться реже, краснота уйдёт за 3-4 дня" },
    ],
    поры: [
      { name: "Сыворотка с ниацинамидом 5%", reason: "Сужает поры и выравнивает тон", effect: "Через месяц поры станут менее заметными, тон кожи выровняется" },
      { name: "Энзимная пудра для умывания", reason: "Мягко отшелушивает и очищает", effect: "Текстура кожи станет более гладкой уже через неделю" },
    ],
    "тёмные круги": [
      { name: "Крем для глаз с кофеином", reason: "Улучшает микроциркуляцию", effect: "Тёмные круги станут светлее через 2 недели регулярного применения" },
      { name: "Патчи с гиалуроновой кислотой", reason: "Интенсивно увлажняют и освежают", effect: "Экспресс-эффект — кожа вокруг глаз выглядит отдохнувшей сразу" },
    ],
    пигментация: [
      { name: "Сыворотка с витамином C", reason: "Осветляет пигментные пятна", effect: "Пигментация станет заметно светлее через 3-4 недели" },
      { name: "SPF 50+ ежедневно", reason: "Защищает от появления новых пятен", effect: "Предотвращает потемнение существующих пятен и появление новых" },
    ],
    морщины: [
      { name: "Крем с ретинолом", reason: "Стимулирует выработку коллагена", effect: "Мелкие морщины разгладятся через месяц, глубокие станут менее заметными" },
      { name: "Сыворотка с пептидами", reason: "Повышает упругость кожи", effect: "Кожа станет более упругой и подтянутой через 2-3 недели" },
    ],
    "чёрные точки": [
      { name: "Сыворотка с салициловой кислотой 2%", reason: "Растворяет пробки в порах", effect: "Чёрные точки станут заметно светлее и меньше через 2 недели" },
      { name: "Энзимная пудра", reason: "Мягко отшелушивает без травмирования", effect: "Поры очистятся, текстура выровняется через 3-4 применения" },
    ],
    "мешки под глазами": [
      { name: "Крем для век с кофеином", reason: "Улучшает микроциркуляцию и отток жидкости", effect: "Отёчность уменьшится утром после первого же применения" },
      { name: "Патчи гидрогелевые", reason: "Охлаждают и увлажняют тонкую кожу век", effect: "Мешки заметно уменьшатся после 15 минут, взгляд станет свежее" },
    ],
    "отёчность век": [
      { name: "Гель для век с экстрактом огурца", reason: "Охлаждает и снимает припухлость", effect: "Отёчность спадает через 10-15 минут после нанесения" },
      { name: "Патчи с зелёным чаем", reason: "Антиоксиданты и кофеин тонизируют кожу век", effect: "Веки выглядят менее припухшими, взгляд открытый" },
    ],
  };

  const links: Array<{ name: string; reason: string; effect: string }> = [];

  for (const [problem, items] of Object.entries(PRODUCTS)) {
    if (problems.some((p) => p.startsWith(problem))) {
      links.push(...items);
    }
  }

  if (links.length === 0) {
    links.push(
      { name: "Мягкая пенка для умывания", reason: "Мягкое очищение без пересушивания", effect: "Кожа остаётся чистой и увлажнённой после каждого умывания" },
      { name: "Увлажняющий крем с гиалуроновой кислотой", reason: "Интенсивно увлажняет", effect: "Спустя неделю кожа станет более упругой и сияющей" },
      { name: "SPF 50+ для лица", reason: "Защита от фотостарения", effect: "Предотвращает преждевременное старение и пигментацию" },
    );
  }

  return links;
}

function scaleValue(v: number): number {
  return Math.max(0, Math.min(100, v));
}

export async function analyzeSkinWithFacePlus(
  imageBase64: string,
): Promise<{
  skin_type: string;
  problems: string[];
  skin_score: number;
  recommendations: string[];
  daily_routine: string;
  mood: "позитивный" | "нейтральный" | "тревожный";
  product_links: Array<{
    name: string;
    reason: string;
    effect: string;
  }>;
}> {
  const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

  const sizeKB = Math.round((cleanBase64.length * 3) / 4 / 1024);
  if (sizeKB < 10) {
    throw new Error("Фото слишком маленькое. Сделайте новый снимок.");
  }

  const buffer = Buffer.from(cleanBase64, "base64");
  const formData = new FormData();
  formData.append("api_key", process.env.FACE_PLUS_KEY!);
  formData.append("api_secret", process.env.FACE_PLUS_SECRET!);
  formData.append("image_file", new Blob([buffer], { type: "image/jpeg" }), "photo.jpg");
  formData.append("return_attributes", "skin_status,skin_health");

  let response: Response;
  try {
    response = await fetch(
      "https://api-us.faceplusplus.com/facepp/v1/skinanalyze",
      {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(20000),
      },
    );
  } catch (e: any) {
    console.error(`[Face++] Network error: ${e.message}`);
    throw new Error("Не удалось подключиться к серверу анализа. Проверьте интернет и попробуйте снова.");
  }

  const raw = await response.text();
  let data: FacePlusResponse;
  try {
    data = JSON.parse(raw);
  } catch {
    console.error(`[Face++] Raw response: ${raw.slice(0, 1000)}`);
    throw new Error("Некорректный ответ от Face++ API");
  }

  console.log(`[Face++] Full response:`, JSON.stringify(data));

  if (data.error_message) {
    console.log(`[Face++] API error: ${data.error_message}`);
    const knownErrors: Record<string, string> = {
      "FACE_NO_FACE": "Не видно лица. Сфотографируйтесь анфас при хорошем освещении, без макияжа, уберите волосы с лица.",
      "FACE_MULTIPLE_FACES": "На фото несколько лиц. Сделайте снимок только своего лица.",
      "FACE_OCCLUDED": "Лицо частично закрыто. Уберите волосы, руки, маску — лицо должно быть полностью видно.",
      "INVALID_IMAGE_SIZE": "Фото слишком большого размера. Сделайте новый снимок.",
      "INVALID_IMAGE_FORMAT": "Формат фото не поддерживается. Используйте JPEG или PNG.",
      "IMAGE_SIZE_TOO_SMALL": "Фото слишком маленькое. Сделайте снимок крупнее, лицо должно занимать большую часть кадра.",
    };
    const userMessage = knownErrors[data.error_message] || `Не удалось проанализировать фото. Пожалуйста, сделайте новый снимок с хорошим освещением.\n(Код ошибки: ${data.error_message})`;
    throw new Error(userMessage);
  }

  if (!data.result) {
    throw new Error("Face++ не смог проанализировать кожу. Попробуйте другое фото.");
  }

  const r = data.result;

  // Map Face++ result to our scoring system (0-100)
  const acneScore = scaleValue(r.acne?.value ?? 0);
  const darkCircleScore = scaleValue(r.dark_circle?.value ?? 0);
  const spotScore = scaleValue(r.skin_spot?.value ?? 0);
  const blackheadScore = scaleValue(r.blackhead?.value ?? 0);
  const eyePouchScore = scaleValue(r.eye_pouch?.value ?? 0);

  // Average pore score across all pore locations
  const poreValues = [
    r.pores_left_cheek?.value ?? 0,
    r.pores_right_cheek?.value ?? 0,
    r.pores_forehead?.value ?? 0,
    r.pores_jaw?.value ?? 0,
  ];
  const poreScore = poreValues.reduce((a, b) => a + scaleValue(b), 0) / poreValues.length;

  // Wrinkle: take max across all wrinkle types
  const wrinkleValues = [
    r.nasolabial_fold?.value ?? 0,
    r.forehead_wrinkle?.value ?? 0,
    r.glabella_wrinkle?.value ?? 0,
    r.crows_feet?.value ?? 0,
    r.eye_finelines?.value ?? 0,
  ];
  const wrinkleScore = Math.max(...wrinkleValues.map(scaleValue));

  // Eyelids: average of both
  const eyelidScore = (scaleValue(r.left_eyelids?.value ?? 0) + scaleValue(r.right_eyelids?.value ?? 0)) / 2;

  // Build score map (excluding mole — not a skin problem)
  const scores: Record<string, number> = {
    acne: acneScore,
    dark_circle: darkCircleScore,
    pore: poreScore,
    spot: spotScore,
    wrinkle: wrinkleScore,
    blackhead: blackheadScore,
    eye_pouch: eyePouchScore,
    eyelids: eyelidScore,
  };

  const skinType = SKIN_TYPE_MAP[r.skin_type?.skin_type] || "нормальная";

  const problems: string[] = [];
  const recommendations: string[] = [];

  for (const [key, score] of Object.entries(scores)) {
    if (score > 50) {
      const problemName = PROBLEM_MAP[key];
      const severity = score === 100 ? "выраженное" : "умеренное";
      if (problemName) {
        problems.push(`${problemName} (${severity})`);
        const recs = RECOMMENDATIONS_MAP[key];
        if (recs) {
          recommendations.push(...recs);
        }
      }
    }
  }

  const mood = determineMood(problems);
  const dailyRoutine = buildRoutine(skinType, problems, acneScore > 50);
  const productLinks = generateProductLinks(problems);

  const avgScore = Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length;
  const skinScore = Math.round(Math.max(0, 100 - avgScore));

  return {
    skin_type: skinType,
    problems,
    skin_score: skinScore,
    recommendations,
    daily_routine: dailyRoutine,
    mood,
    product_links: productLinks,
  };
}
