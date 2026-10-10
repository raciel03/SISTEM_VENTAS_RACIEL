// Tipos compartidos entre la capa Supabase y la app.
// Las interfaces replican las de Index.tsx para no obligar a tocar el monolito.

export interface SaleLevel {
  id: string;
  name: string;
  baseUnitsContained: number;
  purchasePrice: number;
  salePrice: number;
  stock: number;
  initialStock: number;
}

export interface Product {
  id: string;
  name: string;
  purchasePrice: number;
  salePrice: number;
  stock: number;
  initialStock: number;
  category: string;
  type: 'unidad' | 'peso' | 'mayorista';
  imageUrl?: string;
  purchasePricePerKg?: number;
  salePricePerKg?: number;
  equivalentGrams?: number;
  minWeightGrams?: number;
  baseUnit?: string;
  unitsPerBase?: number;
  saleLevels?: SaleLevel[];
  weightInGrams?: number;
}

export interface SaleItem {
  product: Product;
  quantity: number;
  selectedLevelName?: string;
  levelQuantity?: number;
}

export interface Sale {
  id: string;
  items: SaleItem[];
  subtotal: number;
  igv: number;
  igvRate: number;
  total: number;
  totalProfit: number;
  date: string;
  localDate?: string;
  paymentMethod: 'efectivo' | 'tarjeta' | 'yape' | 'plin';
  amountPaid?: number;
  change?: number;
  aplicarRedondeo?: boolean;
}

export interface DailyClose {
  id: string;
  date: string;
  totalSales: number;
  totalProfit: number;
  totalItems: number;
  salesCount: number;
  paymentMethods: {
    efectivo: number;
    tarjeta: number;
    yape: number;
    plin: number;
  };
  closedBy: string;
  closeTime: string;
  transacciones?: Sale[];
}

export interface StockHistoryItem {
  id: string;
  saleId?: string;
  productId: string;
  productName: string;
  type: 'restock' | 'sale' | 'initial' | 'price_change';
  quantity: number;
  resultingStock: number;
  date: string;
  isSummary?: boolean;
  levelQuantities?: { [key: string]: number };
  levelDescription?: string;
  affectedLevelName?: string;
  levelQuantity?: number;
  levelSoldQuantity?: number;
  levelStockAfter?: { [key: string]: number };
  priceChanges?: {
    levelName: string;
    oldSalePrice?: number;
    newSalePrice?: number;
    oldPurchasePrice?: number;
    newPurchasePrice?: number;
  }[];
}

export interface AppUser {
  id: string;
  password: string;
  email: string;
  role: 'admin' | 'empleado';
  name: string;
  createdAt: string;
  firebaseUid?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'empleado';
}

