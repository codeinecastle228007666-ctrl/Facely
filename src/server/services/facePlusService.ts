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
  dark_circle: "темные круги",
  pore: "поры",
  spot: "пигментация",
  wrinkle: "морщины",
};

const RECOMMENDATIONS_MAP: Record<string, string[]> = {
  acne: [
    "Сыворотка с салициловой кислотой 2% для проблемной кожи",
    "Легкий гель с цинком для успокоения воспалений",
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
    parts.push("Увлажнение: легкий гелевый крем");
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
): Array<{ name: string; url: string; image: string; reason: string }> {
  const links: Array<{
    name: string;
    url: string;
    image: string;
    reason: string;
  }> = [];

  if (problems.includes("акне")) {
    links.push({
      name: "Сыворотка с салициловой кислотой 2%",
      url: "https://www.wildberries.ru/catalog/0/search.aspx?search=сыворотка+салициловая+кислота+акне",
      image: "https://via.placeholder.com/100",
      reason: "Салициловая кислота глубоко очищает поры и уменьшает воспаления",
    });
  }
  if (problems.includes("сухость")) {
    links.push({
      name: "Увлажняющий крем с гиалуроновой кислотой",
      url: "https://www.ozon.ru/search/?text=увлажняющий+крем+гиалуроновая+кислота",
      image: "https://via.placeholder.com/100",
      reason: "Гиалуроновая кислота интенсивно увлажняет и восстанавливает кожу",
    });
  }
  if (problems.includes("поры")) {
    links.push({
      name: "Сыворотка с ниацинамидом",
      url: "https://www.wildberries.ru/catalog/0/search.aspx?search=сыворотка+ниацинамид+поры",
      image: "https://via.placeholder.com/100",
      reason: "Ниацинамид сужает поры и выравнивает тон кожи",
    });
  }
  if (problems.includes("морщины")) {
    links.push({
      name: "Крем с ретинолом от морщин",
      url: "https://www.ozon.ru/search/?text=крем+ретинол+морщины",
      image: "https://via.placeholder.com/100",
      reason: "Ретинол стимулирует выработку коллагена и разглаживает морщины",
    });
  }
  if (problems.includes("темные круги")) {
    links.push({
      name: "Патчи под глаза с кофеином",
      url: "https://www.wildberries.ru/catalog/0/search.aspx?search=патчи+под+глаза+кофеин",
      image: "https://via.placeholder.com/100",
      reason: "Кофеин устраняет отечность и осветляет темные круги",
    });
  }
  if (problems.includes("жирность")) {
    links.push({
      name: "Матирующий тоник с цинком",
      url: "https://www.ozon.ru/search/?text=матирующий+тоник+цинк",
      image: "https://via.placeholder.com/100",
      reason: "Цинк регулирует выработку себума и матирует кожу",
    });
  }
  if (problems.includes("пигментация")) {
    links.push({
      name: "Сыворотка с витамином C",
      url: "https://www.wildberries.ru/catalog/0/search.aspx?search=сыворотка+витамин+с+пигментация",
      image: "https://via.placeholder.com/100",
      reason: "Витамин C осветляет пигментные пятна и выравнивает тон",
    });
  }

  if (links.length === 0) {
    links.push({
      name: "Увлажняющий крем SPF 30",
      url: "https://www.ozon.ru/search/?text=увлажняющий+крем+spf",
      image: "https://via.placeholder.com/100",
      reason: "Ежедневная защита и увлажнение для здоровой кожи",
    });
  }

  return links;
}

function scaleValue(v: number): number {
  // Face++ returns 0=not present, 1=present, 2=severe
  // Scale to 0-100 for our threshold system (>50 = problem)
  return v === 2 ? 100 : v === 1 ? 60 : 0;
}

export async function analyzeSkinWithFacePlus(
  imageBase64: string,
): Promise<{
  skin_type: string;
  problems: string[];
  recommendations: string[];
  daily_routine: string;
  mood: "позитивный" | "нейтральный" | "тревожный";
  product_links: Array<{
    name: string;
    url: string;
    image: string;
    reason: string;
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
    throw new Error(`Face++: ${data.error_message}`);
  }

  if (!data.result) {
    throw new Error("Face++ не смог проанализировать кожу. Попробуйте другое фото.");
  }

  const r = data.result;

  // Map Face++ result to our scoring system (0-100)
  const acneScore = scaleValue(r.acne?.value ?? 0);
  const darkCircleScore = scaleValue(r.dark_circle?.value ?? 0);
  const spotScore = scaleValue(r.skin_spot?.value ?? 0);

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

  // Build score map
  const scores: Record<string, number> = {
    acne: acneScore,
    dark_circle: darkCircleScore,
    pore: poreScore,
    spot: spotScore,
    wrinkle: wrinkleScore,
  };

  const skinType = SKIN_TYPE_MAP[r.skin_type?.skin_type] || "нормальная";

  const problems: string[] = [];
  const recommendations: string[] = [];

  for (const [key, score] of Object.entries(scores)) {
    if (score > 50) {
      const problem = PROBLEM_MAP[key];
      if (problem) {
        problems.push(problem);
        const recs = RECOMMENDATIONS_MAP[key];
        if (recs) {
          recommendations.push(recs[0]);
        }
      }
    }
  }

  const mood = determineMood(problems);
  const dailyRoutine = buildRoutine(skinType, problems, acneScore > 50);
  const productLinks = generateProductLinks(problems);

  return {
    skin_type: skinType,
    problems,
    recommendations,
    daily_routine: dailyRoutine,
    mood,
    product_links: productLinks,
  };
}
