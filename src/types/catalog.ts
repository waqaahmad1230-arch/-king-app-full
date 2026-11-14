export interface CatalogProduct {
  id: string;
  name: string;
  description: string;
  originalPrice: number;
  discountPrice?: number;
  stock: number;
  category: string;
  imageUrls: string[];
  videoUrls: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CatalogCategory = 'All' | 'Gaming' | 'Audio' | 'Accessories' | 'Wearables' | string;
