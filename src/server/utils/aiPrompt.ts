export interface ProductLink {
  name: string;
  url: string;
  image: string;
  reason: string;
}

export interface SkinAnalysisResult {
  skin_type: string;
  problems: string[];
  recommendations: string[];
  daily_routine: string;
  mood: "позитивный" | "нейтральный" | "тревожный";
  product_links: ProductLink[];
}
