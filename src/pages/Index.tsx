import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { uploadProductImage, uploadBase64ToCloudinary } from "@/lib/cloudinary";
import { esAdminActual } from "@/lib/permisos";
import { EMPRESA } from "@/config/empresa";
import qz from "qz-tray";
import { loginWithEmail, logout as firebaseLogout, onAuthChange, getCurrentSupabaseUser, enviarResetPassword, cambiarPassword, crearUsuarioPorAdmin } from "@/supabase/auth";
import { createUserProfile, getUserProfile, getUserByEmail, updateUserProfile, deleteUserProfile } from "@/supabase/userService";
import type { UserProfile } from "@/supabase/userService";
import { getAllProducts, createProduct, updateProduct, deleteProduct, subscribeProducts } from "@/supabase/productService";
import { getAllSales, createSale, updateSale, deleteSale, subscribeSales } from "@/supabase/saleService";
import { getAllStockHistory, createStockHistoryItem, updateStockHistoryItem, subscribeStockHistory, deleteStockHistoryItem, getStockHistoryByProduct } from "@/supabase/stockHistoryService";
import { getAllDailyCloses, createDailyClose, updateDailyClose, deleteDailyClose, subscribeDailyCloses } from "@/supabase/dailyCloseService";
import { getAllLocalUsers, createLocalUser, updateLocalUser, deleteLocalUser, subscribeLocalUsers } from "@/supabase/localUserService";
import { 
  ShoppingCart, 
  Package, 
  History, 
  Plus, 
  Minus, 
  Trash2, 
  Search,
  Calculator,
  CreditCard,
  Banknote,
  LogIn,
  User,
  Store,
  Edit,
  Smartphone,
  TrendingUp,
  Calendar,
  Download,
  DollarSign,
  Eye,
  EyeOff,
  FileText,
  UserPlus,
  AlertTriangle,
  Clock,
  Layers,
  Settings,
  CloudUpload,
  RefreshCw,
  CheckCircle2,
  Mail,
  X,
  Lock
} from "lucide-react";

interface SaleLevel {
  id: string;
  name: string;
  baseUnitsContained: number;
  purchasePrice: number;
  salePrice: number;
  stock: number;
  initialStock: number;
}

interface Product {
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

interface SaleItem {
  product: Product;
  quantity: number;
  selectedLevelName?: string;
  levelQuantity?: number;
}

interface Sale {
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

interface DailyClose {
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

interface StockHistoryItem {
  id: string;
  saleId?: string;
  productId: string;
  productName: string;
  type: 'restock' | 'sale' | 'initial' | 'price_change';
  quantity: number;
  resultingStock: number;
  date: string;
  isSummary?: boolean;
  isInitial?: boolean;
  // Campos para productos mayoristas
  levelQuantities?: { [key: string]: number };
  levelDescription?: string;
  affectedLevelName?: string;
  levelQuantity?: number;
  levelSoldQuantity?: number;
  levelStockAfter?: { [key: string]: number };
  // Campos para cambios de precio
  priceChanges?: { levelName: string; oldSalePrice?: number; newSalePrice?: number; oldPurchasePrice?: number; newPurchasePrice?: number }[];
}

interface StockHistoryDisplayRow {
  id: string;
  date: string;
  stockActual: number;
  soldQuantity: number | null;
  addedQuantity: number;
  resultingStock: number;
  isInitial: boolean;
}

interface AppUser {
  id: string;
  password: string;
  email: string;
  role: 'admin' | 'empleado';
  name: string;
  createdAt: string;
  firebaseUid?: string;
}

const normalizeText = (text: string): string =>
  text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const normalizeSearch = (text: string): string =>
  text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
};

let _saleIdCounter = 0;
const generateSaleId = (): string => {
  _saleIdCounter++;
  return `${Date.now()}${_saleIdCounter}`;
};

const stripUndefined = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (obj instanceof Date) return obj.toISOString();
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [k, stripUndefined(v)])
  );
};

const WEIGHT_DECIMAL_PATTERN = /^\d*(?:[.,]\d{0,3})?$/;

// Pending sync helpers: localStorage tracks items created offline that haven't reached Firebase yet
const PENDING = {
  PRODUCTS: 'pos-products-pending',
  SALES: 'pos-sales-pending',
  USERS: 'pos-users-pending',
  CLOSES: 'pos-daily-closes-pending',
  HISTORY: 'pos-stock-history-pending',
};
const addPendingId = (key: string, id: string) => {
  try { const arr = JSON.parse(localStorage.getItem(key) || '[]'); if (!arr.includes(id)) { arr.push(id); safeSetItem(key, JSON.stringify(arr)); } } catch (e) { /* ignore */ }
};
const removePendingId = (key: string, id: string) => {
  try { const arr: string[] = JSON.parse(localStorage.getItem(key) || '[]'); const f = arr.filter(x => x !== id); safeSetItem(key, JSON.stringify(f)); } catch (e) { /* ignore */ }
};
const isPendingId = (key: string, id: string): boolean => {
  try { return (JSON.parse(localStorage.getItem(key) || '[]') as string[]).includes(id); } catch (e) { return false; }
};
const safeSetItem = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch (e) { console.warn('localStorage quota exceeded:', key); }
};
const LOCAL_KEYS = ['pos-products', 'pos-sales', 'pos-users', 'pos-daily-closes', 'pos-stock-history'];
const getLocalBytes = () => {
  let total = 0;
  for (const k of Object.keys(localStorage)) total += (localStorage.getItem(k)?.length || 0) * 2;
  return total;
};
let lastCleanupTime = 0;

const autoCleanupLocal = () => {
  const now = Date.now();
  if (getLocalBytes() < 4 * 1024 * 1024 && now - lastCleanupTime < 300000) return;
  lastCleanupTime = now;
  const pending = new Set<string>();
  for (const pk of [PENDING.PRODUCTS, PENDING.SALES, PENDING.USERS, PENDING.CLOSES, PENDING.HISTORY]) {
    try { (JSON.parse(localStorage.getItem(pk) || '[]') as string[]).forEach(id => pending.add(id)); } catch {}
  }
  for (const key of LOCAL_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      let items = JSON.parse(raw);
      if (!Array.isArray(items)) continue;
      const keepPending = items.filter((i: any) => pending.has(i.id));
      if (key === 'pos-sales') {
        const recent = items.filter((i: any) => !pending.has(i.id)).slice(-500);
        items = [...keepPending, ...recent];
        safeSetItem(key, JSON.stringify(items));
      } else if (key === 'pos-stock-history') {
        const recent = items.filter((i: any) => !pending.has(i.id)).slice(-2000);
        items = [...keepPending, ...recent];
        safeSetItem(key, JSON.stringify(items));
      } else if (key === 'pos-daily-closes') {
        const recent = items.filter((i: any) => !pending.has(i.id)).slice(-100);
        items = [...keepPending, ...recent];
        safeSetItem(key, JSON.stringify(items));
      }
    } catch {}
  }
};

const Index = () => {
  const getLocalDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dia}`;
  };
  const formatearFechaLocal = (fechaStr: string) => {
    const [y, m, d] = fechaStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString();
  };
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState("ventas");
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [dailyCloses, setDailyCloses] = useState<DailyClose[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [currentSale, setCurrentSale] = useState<SaleItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [inventorySearch, setInventorySearch] = useState("");
  const [mayoristaSearch, setMayoristaSearch] = useState("");
  const [transaccionesSearch, setTransaccionesSearch] = useState("");
  const [resumenSearch, setResumenSearch] = useState("");
  const [salesSearch, setSalesSearch] = useState("");
  const [inventoryView, setInventoryView] = useState<'todos' | 'unidad' | 'peso'>('todos');
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'tarjeta' | 'yape' | 'plin'>('efectivo');
  const [amountPaid, setAmountPaid] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [userRole, setUserRole] = useState<'admin' | 'empleado'>('empleado');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isEditWeightProductOpen, setIsEditWeightProductOpen] = useState(false);
  const [editingWeightProduct, setEditingWeightProduct] = useState<Product | null>(null);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isEditProductOpen, setIsEditProductOpen] = useState(false);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  // Modal de confirmacion antes de bloquear un empleado
  const [usuarioAEliminar, setUsuarioAEliminar] = useState<AppUser | null>(null);
  const [isCloseCashOpen, setIsCloseCashOpen] = useState(false);
  const [selectedSaleDetail, setSelectedSaleDetail] = useState<Sale | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedCloseDetail, setSelectedCloseDetail] = useState<DailyClose | null>(null);
  const [isCloseDetailOpen, setIsCloseDetailOpen] = useState(false);
  const [isProductosVendidosOpen, setIsProductosVendidosOpen] = useState(false);
  const [isVentasIndividualesOpen, setIsVentasIndividualesOpen] = useState(false);
  const [showIndividualSales, setShowIndividualSales] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [viewUser, setViewUser] = useState<AppUser | null>(null);
  const [addProductMode, setAddProductMode] = useState<'unidad' | 'peso' | 'mayorista'>('unidad');
  const [newWeightProduct, setNewWeightProduct] = useState({ name: "", purchasePrice: 0, salePrice: 0, purchasePricePerKg: 0, salePricePerKg: 0, equivalentGrams: 0, stock: 0, initialStock: 0, minWeightGrams: 0, category: "" });
  // Manejo de input como string para permitir ceros y decimales (e.g., "0.020")
  const [equivalentGramsInput, setEquivalentGramsInput] = useState('');
  const [equivalentGramsError, setEquivalentGramsError] = useState('');
  const [minWeightInput, setMinWeightInput] = useState('');
  const [minWeightError, setMinWeightError] = useState('');
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  const [restockQuantities, setRestockQuantities] = useState<{ [key: string]: string }>({});
  const [stockHistory, setStockHistory] = useState<StockHistoryItem[]>([]);
  // Recuerdan qué IDs de ventas/historial YA están confirmados (sin cambios) en Firestore,
  // para no reescribir/redescargar todo en cada venta. No afecta el fix de borrado (sigue desactivado).
  const syncedSaleIds = useRef<Set<string>>(new Set());
  const syncedHistoryIds = useRef<Set<string>>(new Set());
  // Ya no se necesita seguimiento de IDs sincronizados — cada sync escribe todo via setDoc (upsert)
  const [modalProductHistory, setModalProductHistory] = useState<StockHistoryItem[]>([]);
  const [isStockHistoryModalOpen, setIsStockHistoryModalOpen] = useState(false);
  const [selectedStockHistoryProduct, setSelectedStockHistoryProduct] = useState<Product | null>(null);
  const [isDeleteStockHistoryOpen, setIsDeleteStockHistoryOpen] = useState(false);
  const [showStockRestockForm, setShowStockRestockForm] = useState(false);
  const [selectedHistoryLevel, setSelectedHistoryLevel] = useState<string>('');
const [stockHistoryRestockQuantity, setStockHistoryRestockQuantity] = useState('');
const [isDeleteSaleOpen, setIsDeleteSaleOpen] = useState(false);
const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null);
  // Estados para reposición mayorista
  const [selectedMayoristaRestockLevel, setSelectedMayoristaRestockLevel] = useState('');
  const [mayoristaRestockQuantity, setMayoristaRestockQuantity] = useState('');

  // Estados para registro de producto mayorista
  const [newMayoristaProduct, setNewMayoristaProduct] = useState({
    name: '',
    category: '',
    initialStock: 0
  });
  const [newMayoristaLevels, setNewMayoristaLevels] = useState<SaleLevel[]>([]);
  const [newLevelDropdown, setNewLevelDropdown] = useState('Paquete');
  const [newLevelCustomName, setNewLevelCustomName] = useState('');
  const [newLevelContains, setNewLevelContains] = useState('');
  const [newLevelPurchasePrice, setNewLevelPurchasePrice] = useState('');
  const [newLevelSalePrice, setNewLevelSalePrice] = useState('');
  const [newLevelStockInput, setNewLevelStockInput] = useState('');
  const [editingNewLevelId, setEditingNewLevelId] = useState<string | null>(null);
  const [editNewTempStock, setEditNewTempStock] = useState('');
  const [editNewTempPurchasePrice, setEditNewTempPurchasePrice] = useState('');
  const [editNewTempSalePrice, setEditNewTempSalePrice] = useState('');
  const [editNewTempContains, setEditNewTempContains] = useState('');

  // Estados para modal de venta mayorista
  const [inventorySubTab, setInventorySubTab] = useState<'general' | 'mayorista'>('general');
  const [ventaMode, setVentaMode] = useState<'regular' | 'mayor'>('regular');
  const [igvRateStr, setIgvRateStr] = useState("18");
  const [aplicarRedondeo, setAplicarRedondeo] = useState<boolean>(true);
  const [isMayoristaModalOpen, setIsMayoristaModalOpen] = useState(false);
  const [newProductImage, setNewProductImage] = useState<File | null>(null);
  const [newProductImagePreview, setNewProductImagePreview] = useState<string>('');
  const [editProductImage, setEditProductImage] = useState<File | null>(null);
  const [editProductImagePreview, setEditProductImagePreview] = useState<string>('');

  const [selectedMayoristaProduct, setSelectedMayoristaProduct] = useState<Product | null>(null);
  const [selectedLevelId, setSelectedLevelId] = useState<string>('');
  const [mayoristaQuantity, setMayoristaQuantity] = useState<number | string>(1);

  // Inputs controlados como string para decimales
  const [unitPurchaseInput, setUnitPurchaseInput] = useState('');
  const [unitSaleInput, setUnitSaleInput] = useState('');
  const [purchasePerKgInput, setPurchasePerKgInput] = useState('');
  const [salePerKgInput, setSalePerKgInput] = useState('');
  // Edit weight product inputs
  const [editPurchasePerKgInput, setEditPurchasePerKgInput] = useState('');
  const [editSalePerKgInput, setEditSalePerKgInput] = useState('');
  const [isMigrating, setIsMigrating] = useState(false);

  // Sincronización en tiempo real entre pestañas y actualización visual
  const [pricePulse, setPricePulse] = useState(false);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'pos-products' && e.newValue) {
        try {
          setProducts(JSON.parse(e.newValue));
        } catch (err) {
          void err;
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  

  const formatCurrency = (n: number) =>
    `S/ ${Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const normalizeDecimalInput = (value: string) => value.replace(',', '.');

  const getWeightInputError = useCallback((raw: string, fieldLabel: string, maxValue?: number) => {
    if (raw === '') return '';
    if (!WEIGHT_DECIMAL_PATTERN.test(raw)) return `${fieldLabel}: solo se permiten numeros con hasta 3 decimales.`;

    const parsed = parseFloat(normalizeDecimalInput(raw));
    if (!Number.isFinite(parsed) || parsed <= 0) return `${fieldLabel}: debe ser mayor a 0.`;
    if (maxValue !== undefined && parsed > maxValue) return `${fieldLabel}: no puede ser mayor al stock inicial.`;

    return '';
  }, []);

  const isWeightFormInvalid = (
    !newWeightProduct.name.trim() ||
    !newWeightProduct.category.trim() ||
    newWeightProduct.purchasePrice <= 0 ||
    newWeightProduct.salePrice <= 0 ||
    newWeightProduct.initialStock <= 0 ||
    newWeightProduct.equivalentGrams <= 0 ||
    newWeightProduct.minWeightGrams <= 0 ||
    !!equivalentGramsError ||
    !!minWeightError
  );

  const isMayoristaFormInvalid = (
    !newMayoristaProduct.name.trim() ||
    !newMayoristaProduct.category.trim() ||
    newMayoristaLevels.length === 0 ||
    (newMayoristaLevels.some(l => l.name === 'Unidad') && newMayoristaLevels.length < 2) ||
    newMayoristaLevels.some(l => l.name === 'Unidad'
      ? (!l.stock || l.stock <= 0)
      : (!newMayoristaLevels.some(lu => lu.name === 'Unidad') && (!l.stock || l.stock <= 0))
    )
  );

  // Estados para edición rápida de productos
  const [editingQuickProduct, setEditingQuickProduct] = useState<Product | null>(null);
  const [isEditQuickProductOpen, setIsEditQuickProductOpen] = useState(false);
  // Estados para modal de peso
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [selectedWeightProduct, setSelectedWeightProduct] = useState<Product | null>(null);
  const [weightQuantities, setWeightQuantities] = useState<{ [key: string]: number }>({});
  const [customWeight, setCustomWeight] = useState('');
  const [customMoney, setCustomMoney] = useState('');
  const [weightInputMode, setWeightInputMode] = useState<'grams' | 'money'>('grams');

  useEffect(() => {
    if (selectedWeightProduct) {
      const updated = products.find(p => p.id === selectedWeightProduct.id);
      if (updated) {
        setSelectedWeightProduct(updated);
        setPricePulse(true);
        const t = setTimeout(() => setPricePulse(false), 300);
        return () => clearTimeout(t);
      }
    }
  }, [products]);

  useEffect(() => {
    if (!isWeightModalOpen) {
      setWeightQuantities({});
      setCustomWeight('');
      setCustomMoney('');
      setWeightInputMode('grams');
    }
  }, [isWeightModalOpen]);

  useEffect(() => {
    if (!isMayoristaModalOpen) {
      setSelectedMayoristaProduct(null);
      setSelectedLevelId('');
      setMayoristaQuantity(1);
    }
  }, [isMayoristaModalOpen]);

  useEffect(() => {
    if (addProductMode !== 'peso') {
      setEquivalentGramsError('');
      setMinWeightError('');
      return;
    }

    const nextError = getWeightInputError(equivalentGramsInput, 'Equivale por gramo');
    const nextValue = nextError || equivalentGramsInput === ''
      ? 0
      : parseFloat(normalizeDecimalInput(equivalentGramsInput)) || 0;

    setEquivalentGramsError(nextError);
    setNewWeightProduct(prev =>
      prev.equivalentGrams === nextValue ? prev : { ...prev, equivalentGrams: nextValue }
    );
  }, [addProductMode, equivalentGramsInput, getWeightInputError]);

  useEffect(() => {
    if (addProductMode !== 'peso') {
      setMinWeightError('');
      return;
    }

    const nextError = getWeightInputError(minWeightInput, 'Peso minimo', newWeightProduct.stock || undefined);
    const nextValue = nextError || minWeightInput === ''
      ? 0
      : parseFloat(normalizeDecimalInput(minWeightInput)) || 0;

    setMinWeightError(nextError);
    setNewWeightProduct(prev =>
      prev.minWeightGrams === nextValue ? prev : { ...prev, minWeightGrams: nextValue }
    );
  }, [addProductMode, minWeightInput, newWeightProduct.stock, getWeightInputError]);

  // Estados para eliminar cierre de caja
  const [isDeleteCloseOpen, setIsDeleteCloseOpen] = useState(false);
  const [closeToDelete, setCloseToDelete] = useState<DailyClose | null>(null);
  const [adminPassword, setAdminPassword] = useState('');

  // Login form states
  const [password, setPassword] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  // Flujo "¿Olvidaste tu contraseña?": tras el enlace de recuperacion se pide la nueva.
  const [showResetPasswordForm, setShowResetPasswordForm] = useState(false);
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [nuevaPassword2, setNuevaPassword2] = useState('');
  const [isRecuperando, setIsRecuperando] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<UserProfile | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);

  // Estado para vista previa de boleta
  const [isBoletaPreviewOpen, setIsBoletaPreviewOpen] = useState(false);
  const [selectedBoletaSale, setSelectedBoletaSale] = useState<Sale | null>(null);
  const [boletaPreviewHTML, setBoletaPreviewHTML] = useState<string>('');

  // Estado para configuración de impresión QZ Tray
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [useQzPrint, setUseQzPrint] = useState(() => localStorage.getItem('qz-print') === 'true');
  const [qzConnected, setQzConnected] = useState(false);
  const [qzPrinters, setQzPrinters] = useState<string[]>([]);
  const [selectedQzPrinter, setSelectedQzPrinter] = useState(() => localStorage.getItem('qz-printer') || '');
  const [isQzTesting, setIsQzTesting] = useState(false);

  const [companyLogo, setCompanyLogo] = useState<string>(
    () => localStorage.getItem('pos-company-logo') || ''
  );

  // Estados para agregar/editar productos
  const [newProductType, setNewProductType] = useState<'general' | 'mayorista'>('general');
  const [isViewMayoristaProductOpen, setIsViewMayoristaProductOpen] = useState(false);
  const [viewingMayoristaProduct, setViewingMayoristaProduct] = useState<Product | null>(null);
  const [isStockCriticoOpen, setIsStockCriticoOpen] = useState(false);
  const [stockCriticoLevels, setStockCriticoLevels] = useState<{ productName: string; levelName: string; stock: number }[]>([]);
  const [isClearSalesOpen, setIsClearSalesOpen] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: '',
    purchasePrice: 0,
    salePrice: 0,
    stock: 0,
    category: ''
  });

  // Estados para almacenamiento
  const [storageAlert, setStorageAlert] = useState<'none' | 'warning' | 'critical'>('none');
  const lastVisibleTimeRef = useRef(Date.now());

  // Estados para modo de eliminación
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedProductsToDelete, setSelectedProductsToDelete] = useState<string[]>([]);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [productsToDelete, setProductsToDelete] = useState<Product[]>([]);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isDeleteProductConfirmOpen, setIsDeleteProductConfirmOpen] = useState(false);

  // Estados para agregar usuarios
  const [newUser, setNewUser] = useState({
    password: '',
    email: '',
    name: '',
    role: 'empleado' as 'admin' | 'empleado'
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const upsertProductFB = useCallback(async (p: Product) => {
    try { await createProduct(p.id, stripUndefined(p)); } catch (e) { console.error('ERROR upsertProductFB:', e); }
  }, []);
  const removeProductFB = useCallback(async (id: string) => {
    try { await deleteProduct(id); } catch (e) { console.error('ERROR removeProductFB:', e); }
  }, []);
  const updateProductFB = useCallback(async (id: string, data: Partial<Product>) => {
    try { await updateProduct(id, stripUndefined(data)); } catch (e) { console.error('ERROR updateProductFB:', e); }
  }, []);
  const syncProductsToFirestore = useCallback(async (_data: Product[]) => {
    // Cada accion ya escribe directo en Supabase (createProduct/updateProduct/
    // deleteProduct). Este "sync" existia para subir un espejo de Firestore, asi
    // que ya no hace nada. Subirlo de nuevo duplicaria filas.
  }, []);
  const syncSalesToFirestore = useCallback(async (_data: any[]) => {
    // Sin espejo: ver syncProductsToFirestore.
  }, []);
  const syncClosesToFirestore = useCallback(async (_data: any[]) => {
    // Sin espejo: ver syncProductsToFirestore.
  }, []);
  const syncHistoryToFirestore = useCallback(async (_data: any[]) => {
    // Sin espejo: ver syncProductsToFirestore.
  }, []);
  const syncUsersToFirestore = useCallback(async (_data: any[]) => {
    // Ver syncProductsToFirestore: ya no hay espejo a la nube.
  }, []);


  // Supabase es la fuente de verdad: el estado se arma solo con lo que llega de
  // la base. El localStorage ya no carga nada, y las claves heredadas de la
  // era Firestore se borran para que ningun dato viejo pueda reaparecer.
  useEffect(() => {
    try {
      const CLAVES_HEREDADAS = [
        'pos-products', 'pos-sales', 'pos-users', 'pos-daily-closes',
        'pos-stock-history', 'pos-products-pending', 'pos-sales-pending',
        'pos-users-pending', 'pos-daily-closes-pending', 'pos-stock-history-pending',
      ];
      CLAVES_HEREDADAS.forEach((k) => localStorage.removeItem(k));
    } catch { /* localStorage bloqueado: no es critico */ }

    (async () => {
      try {
        const [dbProducts, dbSales, dbUsers, dbCloses, dbHistory] = await Promise.all([
          getAllProducts().catch(() => null as any),
          getAllSales().catch(() => null as any),
          getAllLocalUsers().catch(() => null as any),
          getAllDailyCloses().catch(() => null as any),
          getAllStockHistory().catch(() => null as any),
        ]);
        if (dbProducts) {
          setProducts(dbProducts.map(p => ({
            ...p,
            initialStock: (p.initialStock ?? 0) < p.stock ? p.stock : p.initialStock,
            saleLevels: p.saleLevels?.map(l => ({
              ...l,
              initialStock: (l.initialStock ?? 0) < l.stock ? l.stock : l.initialStock
            })) ?? p.saleLevels
          })));
        }
        if (dbSales) {
          setSales(dbSales.map(item => (
            item.localDate ? item : { ...item, localDate: getLocalDateStr(new Date(item.date)) }
          )));
        }
        if (dbUsers) setUsers(dbUsers);
        if (dbCloses) setDailyCloses(dbCloses);
        if (dbHistory) setStockHistory(dbHistory);
      } catch {}
    })();
  }, []);

  // Sincronización en tiempo real desde Firestore (local-first para datos, Firebase para red)
  useEffect(() => {
    if (!isAuthenticated) return;
    const subMergeProducts = (fb: Product[]) => {
      const local: Product[] = [];
      try { const s = localStorage.getItem('pos-products'); if (s) local.push(...JSON.parse(s)); } catch {}
      let merged: Product[] = [...local];
      for (const item of fb) {
        const idx = merged.findIndex(x => x.id === item.id);
        if (idx >= 0) {
          if (!isPendingId(PENDING.PRODUCTS, merged[idx].id)) {
            merged[idx] = item;
          }
          removePendingId(PENDING.PRODUCTS, item.id);
        } else {
          merged.push(item);
        }
      }
      for (const item of local) {
        if (!fb.find(x => x.id === item.id) && isPendingId(PENDING.PRODUCTS, item.id)) {
          createProduct(item.id, stripUndefined(item)).then(() => removePendingId(PENDING.PRODUCTS, item.id)).catch(e => { console.error('ERROR subMerge createProduct:', e); });
        }
      }
      merged = merged.filter(item => isPendingId(PENDING.PRODUCTS, item.id) || fb.find(x => x.id === item.id));
      const fixedProds = merged.map(p => ({
        ...p,
        initialStock: (p.initialStock ?? 0) < p.stock ? p.stock : p.initialStock,
        saleLevels: p.saleLevels?.map(l => ({
          ...l,
          initialStock: (l.initialStock ?? 0) < l.stock ? l.stock : l.initialStock
        })) ?? p.saleLevels
      }));
      setProducts(fixedProds);
      try { localStorage.setItem('pos-products', JSON.stringify(fixedProds)); } catch {}
    };
    const subMergeSales = (fb: Sale[]) => {
      const local: Sale[] = [];
      try { const s = localStorage.getItem('pos-sales'); if (s) local.push(...JSON.parse(s)); } catch {}
      for (const s of fb) { if (!s.localDate) { try { (s as any).localDate = getLocalDateStr(new Date(s.date)); } catch {} } }
      fb.forEach(item => syncedSaleIds.current.add(item.id));
      let merged: Sale[] = [...local];
      for (const item of fb) {
        const idx = merged.findIndex(x => x.id === item.id);
        if (idx >= 0) {
          if (!isPendingId(PENDING.SALES, item.id)) {
            merged[idx] = item;
          }
          removePendingId(PENDING.SALES, item.id);
        } else {
          merged.push(item);
        }
      }
      for (const item of local) {
        if (!fb.find(x => x.id === item.id) && isPendingId(PENDING.SALES, item.id)) {
          createSale(item.id, stripUndefined(item)).then(() => removePendingId(PENDING.SALES, item.id)).catch(e => { console.error('ERROR subMerge createSale:', e); });
        }
      }
      // BUG FIX: conservar TODAS las ventas locales en el merge, no solo las pendientes o en Firebase
      // merged = merged.filter(item => isPendingId(PENDING.SALES, item.id) || fb.find(x => x.id === item.id));
      setSales(merged);
      try { localStorage.setItem('pos-sales', JSON.stringify(merged)); } catch {}
    };
    const subMergeUsers = (fb: AppUser[]) => {
      const local: AppUser[] = [];
      try { const s = localStorage.getItem('pos-users'); if (s) local.push(...JSON.parse(s)); } catch {}
      let merged: AppUser[] = [...local];
      for (const item of fb) {
        const idx = merged.findIndex(x => x.id === item.id);
        if (idx >= 0) {
          if (!isPendingId(PENDING.USERS, merged[idx].id)) {
            merged[idx] = item;
          }
          removePendingId(PENDING.USERS, item.id);
        } else {
          merged.push(item);
        }
      }
      for (const item of local) {
        if (!fb.find(x => x.id === item.id) && isPendingId(PENDING.USERS, item.id)) {
          createLocalUser(item.id, stripUndefined(item)).then(() => removePendingId(PENDING.USERS, item.id)).catch(e => { console.error('ERROR subMerge createUser:', e); });
        }
      }
      merged = merged.filter(item => isPendingId(PENDING.USERS, item.id) || fb.find(x => x.id === item.id));
      setUsers(merged);
      try { localStorage.setItem('pos-users', JSON.stringify(merged)); } catch {}
    };
    const subMergeCloses = (fb: DailyClose[]) => {
      const local: DailyClose[] = [];
      try { const s = localStorage.getItem('pos-daily-closes'); if (s) local.push(...JSON.parse(s)); } catch {}
      let merged: DailyClose[] = [...local];
      for (const item of fb) {
        const idx = merged.findIndex(x => x.id === item.id);
        if (idx >= 0) {
          if (!isPendingId(PENDING.CLOSES, item.id)) {
            merged[idx] = item;
          }
          removePendingId(PENDING.CLOSES, item.id);
        } else {
          merged.push(item);
        }
      }
      for (const item of local) {
        if (!fb.find(x => x.id === item.id) && isPendingId(PENDING.CLOSES, item.id)) {
          createDailyClose(item.id, stripUndefined(item)).then(() => removePendingId(PENDING.CLOSES, item.id)).catch(e => { console.error('ERROR subMerge createClose:', e); });
        }
      }
      merged = merged.filter(item => isPendingId(PENDING.CLOSES, item.id) || fb.find(x => x.id === item.id));
      setDailyCloses(merged);
      try { localStorage.setItem('pos-daily-closes', JSON.stringify(merged)); } catch {}
    };
    const subMergeHistory = (fb: StockHistoryItem[]) => {
      const local: StockHistoryItem[] = [];
      try { const s = localStorage.getItem('pos-stock-history'); if (s) local.push(...JSON.parse(s)); } catch {}
      fb.forEach(item => syncedHistoryIds.current.add(item.id));
      let merged: StockHistoryItem[] = [...local];
      for (const item of fb) {
        const idx = merged.findIndex(x => x.id === item.id);
        if (idx >= 0) {
          if (!isPendingId(PENDING.HISTORY, item.id)) {
            merged[idx] = item;
          }
          removePendingId(PENDING.HISTORY, item.id);
        } else {
          merged.push(item);
        }
      }
      for (const item of local) {
        if (!fb.find(x => x.id === item.id) && isPendingId(PENDING.HISTORY, item.id)) {
          createStockHistoryItem(item.id, stripUndefined(item)).then(() => removePendingId(PENDING.HISTORY, item.id)).catch(e => { console.error('ERROR subMerge createHistory:', e); });
        }
      }
      merged = merged.filter(item => isPendingId(PENDING.HISTORY, item.id) || fb.find(x => x.id === item.id));
      setStockHistory(merged);
      try { localStorage.setItem('pos-stock-history', JSON.stringify(merged)); } catch {}
    };
    const unsubProducts = subscribeProducts(subMergeProducts);
    const unsubSales = subscribeSales(subMergeSales);
    const unsubLocalUsers = subscribeLocalUsers(subMergeUsers);
    const unsubDailyCloses = subscribeDailyCloses(subMergeCloses);
    const unsubStockHistory = subscribeStockHistory(subMergeHistory);
    return () => {
      unsubProducts(); unsubSales(); unsubLocalUsers(); unsubDailyCloses(); unsubStockHistory();
    };
  }, [isAuthenticated]);

  // Force logout si la URL tiene ?forceLogout=true (para TestSprite)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('forceLogout') === 'true') {
      firebaseLogout().then(() => {
        window.history.replaceState({}, '', window.location.pathname);
      });
    }
  }, []);

  // Auth: escuchar cambios de sesión de Firebase
  const authInitializedRef = useRef(false);
  const usersRef = useRef(users);
  useEffect(() => { usersRef.current = users; }, [users]);
  useEffect(() => {
    const unsubscribe = onAuthChange(async (user, evento) => {
      if (evento === 'PASSWORD_RECOVERY') {
        // Llego el enlace de recuperacion: pedir la nueva contrasena antes de entrar.
        setShowResetPasswordForm(true);
        setIsAuthenticated(false);
        setFirebaseUser(null);
        if (!authInitializedRef.current) {
          authInitializedRef.current = true;
          setAuthInitialized(true);
        }
        return;
      }
      if (user) {
        let found = false;
        try {
          let profile = await getUserByEmail(user.email);
          if (!profile) profile = await getUserProfile(user.id);
          if (profile) {
            setFirebaseUser(profile);
            setIsAuthenticated(true);
            setUserRole(profile.role);
            found = true;
          }
        } catch (e) { /* permiso denegado o red */ }
        if (!found) {
          // Fallback: buscar en usuarios locales (offline o rules bloquean)
          const localUser = usersRef.current.find(u => u.email === user.email);
          if (localUser) {
            setFirebaseUser(null);
            setIsAuthenticated(true);
            setUserRole(localUser.role);
          } else {
            setFirebaseUser(null);
          }
        }
      } else {
        setFirebaseUser(null);
        if (authInitializedRef.current) {
          setIsAuthenticated(false);
        }
      }
      if (!authInitializedRef.current) {
        authInitializedRef.current = true;
        setAuthInitialized(true);
      }
    });
    return unsubscribe;
  }, []);

  // Cargar logo por defecto si no hay uno guardado
  useEffect(() => {
    if (!localStorage.getItem('pos-company-logo')) {
      fetch('/logo.jpg')
        .then(res => {
          if (res.ok) return res.blob();
          throw new Error('no logo file');
        })
        .then(blob => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX = 300;
            let w = img.width, h = img.height;
            if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } } else { if (h > MAX) { w *= MAX / h; h = MAX; } }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
            const resized = canvas.toDataURL('image/jpeg', 0.8);
            setCompanyLogo(resized);
            safeSetItem('pos-company-logo', resized);
          };
          img.src = URL.createObjectURL(blob);
        })
        .catch(() => {});
    }
  }, []);

  // Online/offline listeners + auto-sync
  useEffect(() => {
    const handleOffline = () => setIsOnline(false);
    const handleOnline = () => {
      setIsOnline(true);
      const syncData = async () => {
        // Ya no hay cola offline que reenviar. Cada escritura va directo a
        // Supabase; al volver la conexion basta recargar para ver lo nuevo.
        // Reenviar la cola arrastraria datos viejos de localStorage.
        autoCleanupLocal();
        try {
          const [p, s, c, h] = await Promise.all([
            getAllProducts(), getAllSales(), getAllDailyCloses(), getAllStockHistory(),
          ]);
          setProducts(p); setSales(s); setDailyCloses(c); setStockHistory(h);
          toast({ title: "Modo online", description: "Datos sincronizados con Supabase." });
        } catch (e) { console.error('ERROR online-sync outer:', e); }
      };
      syncData();
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Eliminado: cambio forzado de tab al perder conexión

  // Eliminado: recarga forzada al desbloquear pantalla (causaba pérdida de estado)

  const checkStorage = useCallback(() => {
    try {
      autoCleanupLocal();
      let totalSize = 0;
      for (const key of LOCAL_KEYS) {
        const val = localStorage.getItem(key);
        if (val) totalSize += key.length + val.length;
      }
      const usedMB = totalSize / (1024 * 1024);
      if (usedMB > 4.9) setStorageAlert('critical');
      else if (usedMB > 4.5) setStorageAlert('warning');
      else setStorageAlert('none');
    } catch { setStorageAlert('none'); }
  }, []);
  useEffect(() => {
    checkStorage();
    window.addEventListener('storage', checkStorage);
    const interval = setInterval(checkStorage, 30000);
    return () => {
      window.removeEventListener('storage', checkStorage);
      clearInterval(interval);
    };
  }, [checkStorage]);

  const lowStockProducts = useMemo(() => {
    return products.filter(p => {
      if (p.type === 'peso') return p.stock > 0 && p.stock <= 500;
      return p.stock > 0 && p.stock <= 20;
    });
  }, [products]);

  const currentStockHistoryProduct = useMemo(() => {
    if (!selectedStockHistoryProduct) return null;
    return products.find(product => product.id === selectedStockHistoryProduct.id) ?? selectedStockHistoryProduct;
  }, [products, selectedStockHistoryProduct]);

  useEffect(() => {
    const activeProductId = currentStockHistoryProduct?.id || viewingMayoristaProduct?.id;
    if (!activeProductId) {
      setModalProductHistory([]);
      return;
    }
    getStockHistoryByProduct(activeProductId)
      .then(setModalProductHistory)
      .catch((err) => {
        console.error('Error cargando historial del producto:', err);
        setModalProductHistory([]);
      });
  }, [currentStockHistoryProduct, viewingMayoristaProduct]);

  const productStockHistoryEntries = useMemo(() => {
    if (!currentStockHistoryProduct) return [];
    return stockHistory
      .filter(item => item.productId === currentStockHistoryProduct.id)
      .filter(item => item.type !== 'sale' || item.isSummary)
      .sort((a, b) => {
        const timeDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (Math.abs(timeDiff) > 5000) return timeDiff;

        const priority = { sale: 0, restock: 1, initial: 2 };
        return priority[a.type] - priority[b.type];
      });
  }, [currentStockHistoryProduct, stockHistory]);

  const stockHistoryDisplayRows = useMemo<StockHistoryDisplayRow[]>(() => {
    const rows: StockHistoryDisplayRow[] = [];

    productStockHistoryEntries.forEach((item, index) => {
      if (item.type === 'sale') return;

      if (item.type === 'initial') {
        rows.push({
          id: item.id,
          date: item.date,
          stockActual: item.quantity,
          soldQuantity: null,
          addedQuantity: item.quantity,
          resultingStock: item.resultingStock,
          isInitial: true
        });
        return;
      }

      const previousItem = productStockHistoryEntries[index - 1];
      const matchedSale = previousItem?.type === 'sale' && previousItem.isSummary ? previousItem : null;

      rows.push({
        id: item.id,
        date: item.date,
        stockActual: item.resultingStock - item.quantity,
        soldQuantity: matchedSale?.quantity ?? null,
        addedQuantity: item.quantity,
        resultingStock: item.resultingStock,
        isInitial: false
      });
    });

    return rows.reverse();
  }, [productStockHistoryEntries]);

  const stockHistoryCurrentDate = new Date().toLocaleDateString('es-PE');
  
  const getLastStockBaseEntry = useCallback((productId: string) => {
    return [...stockHistory]
      .filter(item => item.productId === productId && (item.type === 'initial' || item.type === 'restock'))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  }, [stockHistory]);

  // Función para obtener categorías más utilizadas (usadas más de 2 veces)
  const getFrequentCategories = useMemo(() => {
    const categoryCount: { [key: string]: number } = {};
    
    products.forEach(product => {
      if (product.category) {
        categoryCount[product.category] = (categoryCount[product.category] || 0) + 1;
      }
    });
    
    // Retornar solo las categorías que se han usado más de 2 veces
    return Object.entries(categoryCount)
      .filter(([_, count]) => count > 2)
      .sort(([_, a], [__, b]) => b - a) // Ordenar por frecuencia descendente
      .map(([category, _]) => category);
  }, [products]);

  const handleRestockChange = (productId: string, quantity: string) => {
    setRestockQuantities(prev => ({ ...prev, [productId]: quantity }));
  };

  const handleApplyRestock = () => {
    const newHistoryItems: StockHistoryItem[] = [];
    
    const updatedProducts = products.map(p => {
      const restockAmount = parseInt(restockQuantities[p.id] || '0');
      if (restockAmount > 0) {
        const lastBaseEntry = getLastStockBaseEntry(p.id);
        const isFirstEntry = !lastBaseEntry;
        const previousBaseStock = lastBaseEntry?.resultingStock ?? 0;
        const soldAmount = isFirstEntry ? 0 : Math.max(previousBaseStock - p.stock, 0);

        let newStock: number;
        let updatedProduct: Product;
        let isLevelBased = p.type === 'mayorista' || (p.type === 'unidad' && p.saleLevels?.length);
        let unitsInMin = 0;

        if (p.type === 'mayorista' && p.saleLevels?.length) {
          const sortedLevels = [...p.saleLevels].sort((a, b) => { if (a.name === 'Unidad') return -1; if (b.name === 'Unidad') return 1; return a.baseUnitsContained - b.baseUnitsContained; });
          const minLevel = sortedLevels[0];
          if (restockAmount < minLevel.baseUnitsContained) {
            toast({
              title: "Cantidad insuficiente",
              description: `El mínimo para este producto es ${minLevel.baseUnitsContained} unidades (1 ${minLevel.name})`,
              variant: "destructive"
            });
            return p;
          }
          unitsInMin = Math.floor(restockAmount / minLevel.baseUnitsContained);
          if (unitsInMin > 0) {
            const updatedLevels = p.saleLevels.map(l =>
              l.name === minLevel.name ? { ...l, stock: l.stock + unitsInMin, initialStock: l.stock + unitsInMin } : l
            );
            newStock = updatedLevels.reduce((sum, l) => sum + l.stock * l.baseUnitsContained, 0);
            updatedProduct = { ...p, saleLevels: updatedLevels, stock: newStock, initialStock: newStock };
          } else {
            newStock = p.stock + restockAmount;
            updatedProduct = { ...p, stock: newStock };
          }
        } else {
          newStock = p.stock + restockAmount;
          updatedProduct = { ...p, stock: newStock };
        }
        if (isFirstEntry) {
          const initialLevelStockAfter = isLevelBased && updatedProduct.saleLevels
            ? updatedProduct.saleLevels.reduce((acc, l) => ({ ...acc, [l.name]: l.initialStock }), {})
            : undefined;

          newHistoryItems.push({
            id: generateId(),
            productId: p.id,
            productName: p.name,
            type: 'initial',
            quantity: restockAmount,
            resultingStock: newStock,
            date: new Date().toISOString(),
            levelStockAfter: initialLevelStockAfter,
            levelQuantities: initialLevelStockAfter
          });
          return updatedProduct;
        }
        if (soldAmount > 0) {
          newHistoryItems.push({
            id: generateId(),
            productId: p.id,
            productName: p.name,
            type: 'sale',
            quantity: soldAmount,
            resultingStock: p.stock,
            date: new Date().toISOString(),
            isSummary: true
          });
        }
        const levelStockAfter = isLevelBased && updatedProduct.saleLevels
          ? updatedProduct.saleLevels.reduce((acc, l) => ({ ...acc, [l.name]: l.stock }), {})
          : undefined;
        newHistoryItems.push({
          id: generateId(),
          productId: p.id,
          productName: p.name,
          type: 'restock',
          quantity: restockAmount,
          resultingStock: newStock,
          date: new Date().toISOString(),
          affectedLevelName: isLevelBased ? (p.saleLevels?.[0]?.name) : undefined,
          levelQuantity: isLevelBased ? unitsInMin : undefined,
          levelStockAfter
        });
          return updatedProduct;
      }
      return p;
    });

    if (newHistoryItems.length > 0) {
      const updatedHistory = [...stockHistory, ...newHistoryItems];
      setStockHistory(updatedHistory);
      safeSetItem('pos-stock-history', JSON.stringify(updatedHistory));
      newHistoryItems.forEach(h => addPendingId(PENDING.HISTORY, h.id));
      syncHistoryToFirestore(updatedHistory);
    }

    setProducts(updatedProducts);
    safeSetItem('pos-products', JSON.stringify(updatedProducts));
    syncProductsToFirestore(updatedProducts);
    toast({
      title: "Stock Repuesto",
      description: "El stock de los productos ha sido actualizado.",
    });
    setIsRestockModalOpen(false);
    setRestockQuantities({});
  };

  const handleAddStockHistoryRestock = () => {
    if (!currentStockHistoryProduct) return;

    const restockAmount = parseInt(stockHistoryRestockQuantity || '0');
    if (!restockAmount || restockAmount <= 0) {
      toast({
        title: "Cantidad inválida",
        description: "Ingresa una cantidad válida para la reposición.",
        variant: "destructive"
      });
      return;
    }

    const lastBaseEntry = getLastStockBaseEntry(currentStockHistoryProduct.id);
    const isFirstEntry = !lastBaseEntry;
    const updatedProducts = products.map(product => {
      if (product.id !== currentStockHistoryProduct.id) return product;
      const hasUnidadLevel = product.saleLevels?.some(l => l.name === 'Unidad');
      const isLevelBased = product.type === 'mayorista' || (product.type === 'unidad' && product.saleLevels?.length);
      return {
        ...product,
        stock: product.stock + restockAmount,
        initialStock: product.stock + restockAmount,
        saleLevels: isLevelBased
          ? product.saleLevels?.map(l =>
              l.name === 'Unidad' || (product.type === 'mayorista' && !hasUnidadLevel)
                ? { ...l, stock: l.stock + restockAmount, initialStock: l.stock + restockAmount }
                : l)
          : product.saleLevels
      };
    });

    const updatedProduct = updatedProducts.find(product => product.id === currentStockHistoryProduct.id);
    if (!updatedProduct) return;

    const previousBaseStock = lastBaseEntry?.resultingStock ?? 0;
    const soldAmount = isFirstEntry ? 0 : Math.max(previousBaseStock - currentStockHistoryProduct.stock, 0);
    const newHistoryItems: StockHistoryItem[] = [];

    const levelStockAfter = updatedProduct.saleLevels
      ? updatedProduct.saleLevels.reduce((acc, l) => ({ ...acc, [l.name]: l.stock }), {})
      : undefined;

    if (isFirstEntry) {
      newHistoryItems.push({
        id: generateId(),
        productId: currentStockHistoryProduct.id,
        productName: currentStockHistoryProduct.name,
        type: 'initial',
        quantity: restockAmount,
        resultingStock: updatedProduct.stock,
        date: new Date().toISOString(),
        levelStockAfter
      });
    } else if (soldAmount > 0) {
      newHistoryItems.push({
        id: generateId(),
        productId: currentStockHistoryProduct.id,
        productName: currentStockHistoryProduct.name,
        type: 'sale',
        quantity: soldAmount,
        resultingStock: currentStockHistoryProduct.stock,
        date: new Date().toISOString(),
        isSummary: true,
        levelStockAfter
      });
    }

    if (!isFirstEntry) {
      newHistoryItems.push({
        id: generateId(),
        productId: currentStockHistoryProduct.id,
        productName: currentStockHistoryProduct.name,
        type: 'restock',
        quantity: restockAmount,
        resultingStock: updatedProduct.stock,
        date: new Date().toISOString(),
        levelStockAfter
      });
    }

    const updatedHistory = [...stockHistory, ...newHistoryItems];
    setProducts(updatedProducts);
    setStockHistory(updatedHistory);
    safeSetItem('pos-products', JSON.stringify(updatedProducts));
    syncProductsToFirestore(updatedProducts);
    safeSetItem('pos-stock-history', JSON.stringify(updatedHistory));
    newHistoryItems.forEach(h => addPendingId(PENDING.HISTORY, h.id));
      syncHistoryToFirestore(updatedHistory);
    setSelectedStockHistoryProduct(updatedProduct);
    setStockHistoryRestockQuantity('');
    setShowStockRestockForm(false);

    toast({
      title: "Reposición guardada",
      description: `Se agregó stock a ${currentStockHistoryProduct.name}.`,
    });
  };

  const handleMigrateImages = async () => {
    setIsMigrating(true);
    const productsWithBase64 = products.filter(p => p.imageUrl && p.imageUrl.startsWith('data:'));
    let success = 0, errors = 0;
    let updatedProducts = [...products];
    for (let i = 0; i < productsWithBase64.length; i++) {
      const p = productsWithBase64[i];
      try {
        const url = await uploadBase64ToCloudinary(p.imageUrl!, p.id);
        updatedProducts = updatedProducts.map(pr => pr.id === p.id ? { ...pr, imageUrl: url } : pr);
        setProducts(updatedProducts);
        safeSetItem('pos-products', JSON.stringify(updatedProducts));
        try { await updateProduct(p.id, stripUndefined({ imageUrl: url })); } catch {}
        success++;
        toast({ title: `Migrando ${i + 1} de ${productsWithBase64.length}`, description: `${p.name} → OK` });
      } catch {
        errors++;
        toast({ title: `Error ${p.name}`, variant: "destructive" });
      }
    }
    toast({ title: "Migración completada", description: `Éxito: ${success}, Errores: ${errors}` });
    setIsMigrating(false);
  };

  // Funciones para modal de peso
  const handleWeightQuantityChange = (weight: string, quantity: number) => {
    setWeightQuantities(prev => ({ ...prev, [weight]: quantity }));
    // Limpiar peso manual cuando se selecciona peso predefinido
    if (quantity > 0) {
      setCustomWeight('');
    }
  };

  const handleAddMayoristaToCart = () => {
    if (!selectedMayoristaProduct || !selectedLevelId) return;

    const level = selectedMayoristaProduct.saleLevels?.find(l => l.id === selectedLevelId);
    if (!level) return;

    const product = selectedMayoristaProduct;
    const qty = typeof mayoristaQuantity === 'number' ? mayoristaQuantity : (parseInt(mayoristaQuantity) || 1);
    const isUnidadBased = product.saleLevels?.some(l => l.name === 'Unidad');
    const stockBase = isUnidadBased
      ? (product.saleLevels?.find(l => l.name === 'Unidad')?.stock ?? 0)
      : product.stock;

    const maxAvailable = isUnidadBased
      ? Math.floor(stockBase / level.baseUnitsContained)
      : level.stock;

    if (qty < 1 || qty > maxAvailable) {
      toast({
        title: "Stock insuficiente",
        description: isUnidadBased
          ? `Stock disponible: ${stockBase} unid. (máx ${maxAvailable} ${level.name}(s))`
          : `Solo hay ${level.stock} ${level.name}(s) disponibles`,
        variant: "destructive"
      });
      return;
    }

    const existingItem = currentSale.find(item =>
      item.product.id === product.id && item.selectedLevelName === level.name
    );

    if (existingItem) {
      const levelName = existingItem.selectedLevelName!;
      const currentLevel = product.saleLevels?.find(l => l.name === levelName);
      const maxLevels = currentLevel
        ? (isUnidadBased ? Math.floor(stockBase / currentLevel.baseUnitsContained) : currentLevel.stock)
        : 0;
      const newQty = existingItem.quantity + qty;
      if (newQty > maxLevels) {
        toast({
          title: "Stock insuficiente",
          description: isUnidadBased
            ? `Stock disponible: ${stockBase} unid. (máx ${maxLevels} ${level.name}(s))`
            : `Solo hay ${maxLevels} ${level.name}(s) disponibles`,
          variant: "destructive"
        });
        return;
      }
      setCurrentSale(currentSale.map(item =>
        item.product.id === product.id && item.selectedLevelName === level.name
          ? { ...item, quantity: newQty }
          : item
      ));
    } else {
      const tempProduct: Product = {
        ...product,
        salePrice: level.salePrice,
        purchasePrice: level.purchasePrice,
        stock: level.baseUnitsContained * qty,
      };
      setCurrentSale([...currentSale, {
        product: tempProduct,
        quantity: qty,
        selectedLevelName: level.name,
        levelQuantity: qty
      }]);
    }

    setIsMayoristaModalOpen(false);

    toast({
      title: "Producto agregado",
      description: `${qty} ${level.name}(s) de ${product.name} agregado al carrito`,
    });
  };

  const handleAddWeightToCart = () => {
    if (!selectedWeightProduct) return;

    const pricePerKg = selectedWeightProduct.salePricePerKg ?? selectedWeightProduct.salePrice ?? 0;

    if (weightInputMode === 'money' && pricePerKg <= 0) {
      toast({
        title: "Precio no válido",
        description: "Este producto no tiene precio por kilo; usa el modo por peso",
        variant: "destructive"
      });
      return;
    }

    let totalWeight = 0;
    let totalPrice = 0;

    // Calcular peso total de las cantidades seleccionadas
    Object.entries(weightQuantities).forEach(([weight, quantity]) => {
      const weightGrams = parseInt(weight);
      totalWeight += weightGrams * quantity;
    });

    // Agregar peso personalizado o dinero según el modo
    if (weightInputMode === 'grams') {
      if (customWeight && parseFloat(customWeight) > 0) {
        totalWeight += parseFloat(customWeight);
      }
    } else {
      if (customMoney && parseFloat(customMoney) > 0) {
        totalWeight += Math.round((parseFloat(customMoney) * 1000) / pricePerKg);
      }
    }

    if (totalWeight <= 0) {
      toast({
        title: "Entrada requerida",
        description: "Debes seleccionar un peso o ingresar un monto válido para agregar al carrito",
        variant: "destructive"
      });
      return;
    }

    const minWeight = selectedWeightProduct.minWeightGrams || 0;
    if (minWeight > 0 && totalWeight < minWeight) {
      toast({
        title: "Peso mínimo no alcanzado",
        description: `El mínimo de venta es ${formatWeight(minWeight)}`,
        variant: "destructive"
      });
      return;
    }

    if (totalWeight > selectedWeightProduct.stock) {
      toast({
        title: "Stock insuficiente",
        description: `Solo hay ${formatWeight(selectedWeightProduct.stock)} disponibles`,
        variant: "destructive"
      });
      return;
    }

    // Calcular precio total usando siempre salePricePerKg
    totalPrice = pricePerKg * (totalWeight / 1000);

    // Crear un producto temporal para la venta (sin mutar salePrice)
    const tempProduct: Product = {
      ...selectedWeightProduct,
      salePrice: pricePerKg,
      stock: totalWeight,
      weightInGrams: totalWeight,
    };

    const existingItem = currentSale.find(item => item.product.id === selectedWeightProduct.id);
    
    if (existingItem) {
      // Si ya existe, actualizar cantidad
      const newQuantity = existingItem.quantity + totalWeight;
      if (newQuantity <= selectedWeightProduct.stock) {
        actualizarCantidad(selectedWeightProduct.id, newQuantity);
      } else {
        toast({
          title: "Stock insuficiente",
          description: `No hay suficiente stock disponible`,
          variant: "destructive"
        });
        return;
      }
    } else {
      // Agregar nuevo item
      setCurrentSale([...currentSale, { product: tempProduct, quantity: totalWeight }]);
    }

    setIsWeightModalOpen(false);
    setSelectedWeightProduct(null);
    setWeightQuantities({});
    setCustomWeight('');
    setCustomMoney('');
    setWeightInputMode('grams');
    
    toast({
      title: "Producto agregado",
      description: `${totalWeight}g de ${selectedWeightProduct.name} agregado al carrito`,
    });
  };

  const handleLogin = async () => {
    if (!loginEmail || !password) {
      toast({
        title: "Campos requeridos",
        description: "Por favor ingresa correo y contraseña",
        variant: "destructive"
      });
      return;
    }

    setIsAuthLoading(true);

    try {
      await loginWithEmail(loginEmail, password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast({
        title: "Error de autenticación",
        description: "Verifica tu conexión a internet o credenciales: " + msg,
        variant: "destructive"
      });
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const correo = loginEmail.trim();
    if (!correo) {
      toast({
        title: "Escribe tu correo primero",
        description: "Pon tu correo en el formulario para enviarte el enlace de recuperación.",
        variant: "destructive",
      });
      return;
    }
    setIsRecuperando(true);
    try {
      await enviarResetPassword(correo);
      toast({
        title: "Correo enviado",
        description: `Revisa ${correo}: llegó un enlace para crear una nueva contraseña.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast({ title: "No se pudo enviar el enlace", description: msg, variant: "destructive" });
    } finally {
      setIsRecuperando(false);
    }
  };

  const handleGuardarNuevaPassword = async () => {
    if (nuevaPassword.length < 6) {
      toast({ title: "Contraseña muy corta", description: "Usa al menos 6 caracteres.", variant: "destructive" });
      return;
    }
    if (nuevaPassword !== nuevaPassword2) {
      toast({ title: "No coinciden", description: "La confirmación no coincide con la nueva contraseña.", variant: "destructive" });
      return;
    }
    setIsRecuperando(true);
    try {
      await cambiarPassword(nuevaPassword);
      await firebaseLogout();
      setShowResetPasswordForm(false);
      setNuevaPassword('');
      setNuevaPassword2('');
      toast({
        title: "Contraseña actualizada",
        description: "Ahora inicia sesión con tu nueva contraseña.",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast({ title: "No se pudo actualizar", description: msg, variant: "destructive" });
    } finally {
      setIsRecuperando(false);
    }
  };

  const handleForceSync = async () => {
    toast({ title: "Sincronizando...", description: "Obteniendo datos desde Supabase" });
    try {
      const [fbProducts, fbSales, fbUsers, fbCloses, fbHistory] = await Promise.all([
        getAllProducts().catch(() => null as any),
        getAllSales().catch(() => null as any),
        getAllLocalUsers().catch(() => null as any),
        getAllDailyCloses().catch(() => null as any),
        getAllStockHistory().catch(() => null as any),
      ]);
      if (fbProducts) {
        const local: Product[] = []; try { const s = localStorage.getItem('pos-products'); if (s) local.push(...JSON.parse(s)); } catch {}
        for (const item of fbProducts) { if (!local.find(x => x.id === item.id)) local.push(item); }
        setProducts(local); try { localStorage.setItem('pos-products', JSON.stringify(local)); } catch {}
      }
      if (fbSales) {
        const local: Sale[] = []; try { const s = localStorage.getItem('pos-sales'); if (s) local.push(...JSON.parse(s)); } catch {}
        for (const item of fbSales) {
          if (!item.localDate) { try { (item as any).localDate = getLocalDateStr(new Date(item.date)); } catch {} }
          if (!local.find(x => x.id === item.id)) local.push(item);
        }
        fbSales.forEach(item => syncedSaleIds.current.add(item.id));
        setSales(local); try { localStorage.setItem('pos-sales', JSON.stringify(local)); } catch {}
      }
      if (fbUsers) {
        const local: AppUser[] = []; try { const s = localStorage.getItem('pos-users'); if (s) local.push(...JSON.parse(s)); } catch {}
        for (const item of fbUsers) { if (!local.find(x => x.id === item.id)) local.push(item); }
        setUsers(local); try { localStorage.setItem('pos-users', JSON.stringify(local)); } catch {}
      }
      if (fbCloses) {
        const local: DailyClose[] = []; try { const s = localStorage.getItem('pos-daily-closes'); if (s) local.push(...JSON.parse(s)); } catch {}
        for (const item of fbCloses) { if (!local.find(x => x.id === item.id)) local.push(item); }
        setDailyCloses(local); try { localStorage.setItem('pos-daily-closes', JSON.stringify(local)); } catch {}
      }
      if (fbHistory) {
        const local: StockHistoryItem[] = []; try { const s = localStorage.getItem('pos-stock-history'); if (s) local.push(...JSON.parse(s)); } catch {}
        for (const item of fbHistory) { if (!local.find(x => x.id === item.id)) local.push(item); }
        setStockHistory(local); try { localStorage.setItem('pos-stock-history', JSON.stringify(local)); } catch {}
        fbHistory.forEach(item => syncedHistoryIds.current.add(item.id));
      }
      toast({ title: "Sincronización completa", description: "Datos actualizados desde Supabase" });
    } catch {
      toast({ title: "Error de sincronización", description: "No se pudo conectar con Supabase", variant: "destructive" });
    }
  };

  const calcularIGV = (subtotal: number) => {
    const rate = parseFloat(igvRateStr) || 18;
    return subtotal * rate / (100 + rate);
  };

  const agregarProductoVenta = (product: Product) => {
    const stockValido = product.saleLevels?.some(l => l.name === 'Unidad')
      ? (product.saleLevels.find(l => l.name === 'Unidad')?.stock ?? 0)
      : product.stock;
    if (stockValido <= 0) {
      toast({
        title: "Sin stock",
        description: "Este producto no tiene stock disponible",
        variant: "destructive"
      });
      return;
    }

    if (product.type === 'peso') {
      setSelectedWeightProduct(product);
      setWeightQuantities({});
      setCustomWeight('');
      setIsWeightModalOpen(true);
      return;
    }

    if (product.type === 'mayorista') {
      setSelectedMayoristaProduct(product);
      setSelectedLevelId(product.saleLevels?.[0]?.id || '');
      setMayoristaQuantity(1);
      setIsMayoristaModalOpen(true);
      return;
    }

    if (product.type === 'unidad' && product.saleLevels && product.saleLevels.length > 0) {
      setSelectedMayoristaProduct(product);
      const unidadLevel = product.saleLevels.find(l => l.name === 'Unidad');
      setSelectedLevelId(unidadLevel?.id || product.saleLevels[0].id);
      setMayoristaQuantity(1);
      setIsMayoristaModalOpen(true);
      return;
    }

    const existingItem = currentSale.find(item => item.product.id === product.id);
    
    if (existingItem) {
      if (existingItem.quantity < product.stock) {
        actualizarCantidad(product.id, existingItem.quantity + 1);
      } else {
        toast({
          title: "Stock insuficiente",
          description: `Solo hay ${product.stock} unidades disponibles`,
          variant: "destructive"
        });
      }
    } else {
      setCurrentSale([...currentSale, { product, quantity: 1 }]);
    }
  };

  const actualizarCantidad = (productId: string, newQuantity: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const saleItem = currentSale.find(item => item.product.id === productId);
    const levelName = saleItem?.selectedLevelName;

    if (product.type === 'mayorista' || levelName) {
      const level = product.saleLevels?.find(l => l.name === levelName);
      if (!level) {
        toast({ title: "Producto no encontrado", description: "No se encontró el nivel de venta", variant: "destructive" });
        return;
      }
      const maxLevels = level.stock > 0
        ? level.stock
        : Math.floor(product.stock / level.baseUnitsContained);
      if (newQuantity > maxLevels) {
        toast({
          title: "Stock insuficiente",
          description: `Solo hay ${maxLevels} ${level.name}(s) disponibles`,
          variant: "destructive"
        });
        return;
      }
    } else if (newQuantity > product.stock) {
      toast({
        title: "Stock insuficiente",
        description: product.type === 'peso'
          ? `Solo hay ${formatWeight(product.stock)} disponibles`
          : `Solo hay ${product.stock} unidades disponibles`,
        variant: "destructive"
      });
      return;
    }

    if (newQuantity <= 0) {
      eliminarProductoVenta(productId, levelName);
      return;
    }

    setCurrentSale(currentSale.map(item => {
      if (item.product.id === productId && (item.selectedLevelName ?? null) === (levelName ?? null)) {
        if (item.product.type === 'peso') {
          return {
            ...item,
            quantity: newQuantity,
          };
        }
        if ((item.product.type === 'mayorista' || item.selectedLevelName) && item.selectedLevelName) {
          const level = item.product.saleLevels?.find(l => l.name === item.selectedLevelName);
          if (level) {
            return {
              ...item,
              quantity: newQuantity,
              product: {
                ...item.product,
                salePrice: level.salePrice,
                purchasePrice: level.purchasePrice
              }
            };
          }
        }
        return { ...item, quantity: newQuantity };
      }
      return item;
    }));
  };

  const eliminarProductoVenta = (productId: string, selectedLevelName?: string) => {
    setCurrentSale(currentSale.filter(item =>
      !(item.product.id === productId && (item.selectedLevelName ?? null) === (selectedLevelName ?? null))
    ));
  };

  const calcularSubtotal = () => {
    return currentSale.reduce((total, item) => {
      if (item.product.type === 'peso') {
        return total + ((item.product.salePricePerKg || 0) * (item.quantity / 1000));
      }
      const level = item.selectedLevelName ? item.product.saleLevels?.find(l => l.name === item.selectedLevelName) : undefined;
      const price = level?.salePrice ?? item.product.salePrice ?? 0;
      return total + (price * item.quantity);
    }, 0);
  };

  const calcularTotal = () => {
    return calcularSubtotal();
  };

  const calcularCambio = () => {
    const paid = parseFloat(amountPaid) || 0;
    if (paymentMethod === 'efectivo' && paid > 0) {
      const totalFinal = aplicarRedondeo ? redondearTotalEfectivo(calcularTotal()) : calcularTotal();
      return Math.max(0, paid - totalFinal);
    }
    return 0;
  };

  const redondearTotalEfectivo = (total: number) => {
    const centimos = Math.round(total * 100);
    const decimoCentimo = centimos % 10;
    let redondeadoCentimos: number;
    
    if (decimoCentimo < 5) {
      redondeadoCentimos = centimos - decimoCentimo;
    } else {
      redondeadoCentimos = centimos + (10 - decimoCentimo);
    }
    
    return redondeadoCentimos / 100;
  };

  const formatWeight = (grams: number) => {
    if (grams === undefined || isNaN(grams)) return '0g';
    const kg = Math.floor(grams / 1000);
    const g = grams % 1000;
    if (kg > 0 && g > 0) {
      return `${kg}kg ${g}g`;
    } else if (kg > 0) {
      return `${kg}kg`;
    } else {
      return `${g}g`;
    }
  };

  const confirmarVenta = async () => {
    if (currentSale.length === 0) {
      toast({
        title: "Venta vacía",
        description: "Agrega productos antes de confirmar la venta",
        variant: "destructive"
      });
      return;
    }

    const rawSubtotal = calcularSubtotal();
    const subtotal = Math.round(rawSubtotal * 100) / 100;
    const igv = calcularIGV(subtotal);
    const total = subtotal;
    const totalRedondeado = (paymentMethod === 'efectivo' && aplicarRedondeo) ? redondearTotalEfectivo(total) : total;
    const totalProfit = currentSale.reduce((total, item) => {
      if (item.product.type === 'peso') {
        const totalKg = item.quantity / 1000;
        const profitPerKg = (item.product.salePricePerKg || 0) - (item.product.purchasePricePerKg || 0);
        return total + (profitPerKg * totalKg);
      }
      const level = item.selectedLevelName ? item.product.saleLevels?.find(l => l.name === item.selectedLevelName) : undefined;
      const salePrice = level?.salePrice ?? item.product.salePrice ?? 0;
      const purchasePrice = level?.purchasePrice ?? item.product.purchasePrice ?? 0;
      return total + ((salePrice - purchasePrice) * item.quantity);
    }, 0);
    
    if (paymentMethod === 'efectivo') {
      if (!amountPaid || amountPaid.trim() === '') {
        toast({
          title: "Monto requerido",
          description: "Debe ingresar el monto recibido para ventas en efectivo",
          variant: "destructive"
        });
        return;
      }
      
      const paidAmount = parseFloat(amountPaid);
      if (isNaN(paidAmount) || paidAmount < totalRedondeado) {
        toast({
          title: "Pago insuficiente",
          description: `El monto pagado es menor al total (S/ ${totalRedondeado.toFixed(2)})`,
          variant: "destructive"
        });
        return;
      }
    }

    const updatedProducts = products.map(product => {
      const saleItems = currentSale.filter(item => item.product.id === product.id);
      if (saleItems.length === 0) return product;

      const hasUnidadLevel = product.saleLevels?.some(l => l.name === 'Unidad');

      if (hasUnidadLevel) {
        const totalUnits = saleItems.reduce((sum, item) => {
          const level = product.saleLevels?.find(l => l.name === item.selectedLevelName);
          return sum + ((level?.baseUnitsContained || 1) * item.quantity);
        }, 0);
        return {
          ...product,
          stock: Math.max(0, product.stock - totalUnits),
          saleLevels: product.saleLevels?.map(l =>
            l.name === 'Unidad'
              ? { ...l, stock: Math.max(0, l.stock - totalUnits) }
              : l
          )
        };
      }

      if (product.type === 'mayorista') {
        let updatedLevels = product.saleLevels ? [...product.saleLevels] : [];
        for (const saleItem of saleItems) {
          if (saleItem.selectedLevelName) {
            updatedLevels = updatedLevels.map(l => {
              if (l.name === saleItem.selectedLevelName) {
                return { ...l, stock: Math.max(0, l.stock - saleItem.quantity) };
              }
              return l;
            });
          }
        }
        const newTotalStock = updatedLevels.reduce((sum, l) => sum + l.stock * l.baseUnitsContained, 0);
        return { ...product, saleLevels: updatedLevels, stock: newTotalStock };
      }

      const totalUnits = saleItems.reduce((sum, item) => {
        if (product.type === 'mayorista' && item.selectedLevelName) {
          const level = product.saleLevels?.find(l => l.name === item.selectedLevelName);
          return sum + ((level?.baseUnitsContained || 1) * item.quantity);
        }
        return sum + item.quantity;
      }, 0);
      return { ...product, stock: product.stock - totalUnits };
    });

    // Validar stock antes de confirmar (evita sobreventa con 2 pestañas o cajas)
    for (const product of products) {
      const saleItems = currentSale.filter(item => item.product.id === product.id);
      if (saleItems.length === 0) continue;
      const hasUnidadLevel = product.saleLevels?.some(l => l.name === 'Unidad');

      if (hasUnidadLevel) {
        // Modelo A: stock general en unidades compartido entre los niveles
        const totalUnits = saleItems.reduce((sum, item) => {
          const level = product.saleLevels?.find(l => l.name === item.selectedLevelName);
          return sum + ((level?.baseUnitsContained || 1) * item.quantity);
        }, 0);
        if (product.stock - totalUnits < 0) {
          toast({
            title: "Stock insuficiente",
            description: `${product.name}: solo quedan ${product.stock} unidades`,
            variant: "destructive"
          });
          return;
        }
      } else if (product.type === 'mayorista') {
        // Modelo B: cada nivel tiene su propio stock
        for (const saleItem of saleItems) {
          if (!saleItem.selectedLevelName) {
            if (product.stock - saleItem.quantity < 0) {
              toast({
                title: "Stock insuficiente",
                description: `${product.name}: solo quedan ${product.stock} unidades`,
                variant: "destructive"
              });
              return;
            }
            continue;
          }
          const level = product.saleLevels?.find(l => l.name === saleItem.selectedLevelName);
          if (level && level.stock - saleItem.quantity < 0) {
            toast({
              title: "Stock insuficiente",
              description: `${product.name} (${level.name}): solo quedan ${level.stock} disponibles`,
              variant: "destructive"
            });
            return;
          }
        }
      } else {
        // Unidad simple o Peso (cantidad en gramos vs stock en gramos)
        const totalQty = saleItems.reduce((sum, item) => sum + item.quantity, 0);
        if (product.stock - totalQty < 0) {
          toast({
            title: "Stock insuficiente",
            description: product.type === 'peso'
              ? `${product.name}: solo quedan ${formatWeight(product.stock)}`
              : `${product.name}: solo quedan ${product.stock} unidades`,
            variant: "destructive"
          });
          return;
        }
      }
    }

    const newSaleId = generateSaleId();

    // Agregar registros de ventas al historial de stock
    const newHistoryItems: StockHistoryItem[] = currentSale.flatMap(item => {
      const product = products.find(p => p.id === item.product.id);
      const updatedProduct = updatedProducts.find(p => p.id === item.product.id);
      if (!product || !updatedProduct) return [];

      if (item.product.type === 'mayorista' || (item.product.type === 'unidad' && product.saleLevels?.length)) {
        const level = product.saleLevels?.find(l => l.name === item.selectedLevelName);
        if (level) {
          return {
            id: generateId(),
            saleId: newSaleId,
            productId: product.id,
            productName: product.name,
            type: 'sale' as const,
            quantity: item.quantity,
            resultingStock: updatedProduct.stock,
            date: new Date().toISOString(),
            affectedLevelName: item.selectedLevelName,
            levelQuantity: item.quantity
          };
        }
        if (item.product.type === 'mayorista') return [];
      }

      return {
        id: generateId(),
        saleId: newSaleId,
        productId: product.id,
        productName: product.name,
        type: 'sale' as const,
        quantity: item.quantity,
        resultingStock: updatedProduct.stock,
        date: new Date().toISOString()
      };
    });

    const updatedHistory = [...stockHistory, ...newHistoryItems];

    const newSale: Sale = {
      id: newSaleId,
      items: currentSale.map(item => ({
        ...item,
          product: {
            id: item.product.id,
            name: item.product.name,
            salePrice: item.product.salePrice,
            purchasePrice: item.product.purchasePrice,
            type: item.product.type,
            stock: item.product.stock,
            initialStock: item.product.initialStock,
            category: item.product.category,
            salePricePerKg: item.product.salePricePerKg,
            purchasePricePerKg: item.product.purchasePricePerKg
          }
      })),
      subtotal,
      igv,
      igvRate: parseFloat(igvRateStr) || 18,
      total: totalRedondeado,
      totalProfit,
      date: new Date().toISOString(),
      localDate: getLocalDateStr(new Date()),
      paymentMethod,
      amountPaid: paymentMethod === 'efectivo' ? parseFloat(amountPaid) : totalRedondeado,
      change: paymentMethod === 'efectivo' ? calcularCambio() : 0,
      aplicarRedondeo
    };

    const productsToUpdate = updatedProducts.filter(p => {
      const old = products.find(ex => ex.id === p.id);
      return old && (old.stock !== p.stock || old.salePrice !== p.salePrice || old.purchasePrice !== p.purchasePrice || JSON.stringify(old.saleLevels) !== JSON.stringify(p.saleLevels));
    });
    const productsToCreate = updatedProducts.filter(p => !products.find(ex => ex.id === p.id));

    // Marcar venta y productos como "EN CAMINO" ANTES de guardar en el navegador,
    // para que el merge en tiempo real jamás los oculte antes de llegar a Firebase.
    addPendingId(PENDING.SALES, newSale.id);
    productsToUpdate.forEach(p => addPendingId(PENDING.PRODUCTS, p.id));
    productsToCreate.forEach(p => addPendingId(PENDING.PRODUCTS, p.id));

    setProducts(updatedProducts);
    setSales([...sales, newSale]);
    setStockHistory(updatedHistory);
    setCurrentSale([]);
    setAmountPaid("");

    // Guardar a localStorage ANTES de Firebase (protege contra recargas)
    safeSetItem('pos-products', JSON.stringify(updatedProducts));
    safeSetItem('pos-sales', JSON.stringify([...sales, newSale]));
    safeSetItem('pos-stock-history', JSON.stringify(updatedHistory));

    toast({
      title: "Venta confirmada",
      description: `Venta por S/ ${totalRedondeado.toFixed(2)} registrada exitosamente`,
    });

    imprimirTicket(newSale);

    // Intentar sync a Firebase directo (tiempo real); quitar "EN CAMINO" al confirmar
    createSale(newSale.id, stripUndefined(newSale))
      .then(() => removePendingId(PENDING.SALES, newSale.id))
      .catch(e => { console.error('ERROR createSale:', e); addPendingId(PENDING.SALES, newSale.id); });
    Promise.all([
      ...productsToUpdate.map(p => updateProduct(p.id, stripUndefined({ stock: p.stock, salePrice: p.salePrice, purchasePrice: p.purchasePrice, saleLevels: p.saleLevels }))
        .then(() => removePendingId(PENDING.PRODUCTS, p.id))
        .catch(e => { console.error('ERROR updateProduct:', e); addPendingId(PENDING.PRODUCTS, p.id); })),
      ...productsToCreate.map(p => createProduct(p.id, stripUndefined(p))
        .then(() => removePendingId(PENDING.PRODUCTS, p.id))
        .catch(e => { console.error('ERROR createProduct:', e); addPendingId(PENDING.PRODUCTS, p.id); })),
    ]);
    syncHistoryToFirestore(updatedHistory).catch(e => { console.error('ERROR syncHistory:', e); newHistoryItems.forEach(h => addPendingId(PENDING.HISTORY, h.id)); });
    autoCleanupLocal();
  };
  
  useEffect(() => {
    safeSetItem('qz-print', String(useQzPrint));
  }, [useQzPrint]);

  useEffect(() => {
    if (selectedQzPrinter) safeSetItem('qz-printer', selectedQzPrinter);
  }, [selectedQzPrinter]);

  const conectarQZTray = async () => {
    try {
      await qz.websocket.connect();
      const printers = await qz.printers.find();
      const printerNames = printers.map((p: any) => p.name || p);
      setQzPrinters(printerNames);
      setQzConnected(true);
      if (!selectedQzPrinter && printerNames.length > 0) {
        setSelectedQzPrinter(printerNames[0]);
      }
      return printerNames;
    } catch (e) {
      setQzConnected(false);
      setQzPrinters([]);
      return [];
    }
  };

  const desconectarQZTray = async () => {
    try { await qz.websocket.disconnect(); } catch {}
    setQzConnected(false);
    setQzPrinters([]);
  };

  const probarQZTray = async () => {
    setIsQzTesting(true);
    try {
      const printers = qzConnected ? qzPrinters : await conectarQZTray();
      if (printers.length > 0 && selectedQzPrinter) {
        const config = qz.configs.create(selectedQzPrinter);
        toast({ title: "Conexión exitosa", description: "QZ Tray está configurado correctamente." });
      }
    } catch (e) { console.error('ERROR probarQZTray:', e); toast({ title: "Error de impresión", description: "No se pudo imprimir. Verifica QZ Tray.", variant: "destructive" }); }
    setIsQzTesting(false);
  };

  const formatearProductoTicket = (item: SaleItem) => {
    const nombre = item.product.name;
    let result = '';
    if (item.product.type === 'peso') {
      const kgDisplay = item.quantity >= 1000
        ? `${(item.quantity / 1000).toFixed(3)}kg`
        : `${item.quantity}g`;
      const precioUnitario = item.product.salePricePerKg || 0;
      const totalItem = precioUnitario * (item.quantity / 1000);
      result += `${nombre}\n`;
      result += `       ${kgDisplay} x S/ ${precioUnitario.toFixed(2)}/kg = S/ ${totalItem.toFixed(2).padStart(7)}`;
    } else if (item.product.type === 'mayorista') {
      const nivel = item.selectedLevelName || 'Und';
      const cantDisplay = `${item.quantity} ${nivel}(s)`;
      const precioUnitario = item.product.salePrice || 0;
      const totalItem = precioUnitario * item.quantity;
      const level = item.product.saleLevels?.find(l => l.name === item.selectedLevelName);
      const totalUnits = (level?.baseUnitsContained || 1) * item.quantity;
      result += `${nombre}\n`;
      result += `       ${cantDisplay} x S/ ${precioUnitario.toFixed(2)} = S/ ${totalItem.toFixed(2).padStart(7)}\n`;
      result += `       → ${totalUnits} unidades`;
    } else {
      const totalItem = (item.product.salePrice || 0) * item.quantity;
      result += `${nombre}\n`;
      result += `       ${item.quantity} x S/ ${(item.product.salePrice || 0).toFixed(2)} = S/ ${totalItem.toFixed(2).padStart(7)}`;
    }
    return result;
  };

  const generarBoletaHTML = (venta: Sale, previewMode = false) => {
    const fecha = new Date(venta.date);
    const fechaStr = fecha.toLocaleDateString('es-PE');
    const horaStr = fecha.toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit', hour12: true });
    const metodosPago: Record<string, string> = {
      efectivo: 'EFECTIVO',
      tarjeta: 'TARJETA',
      yape: 'YAPE',
      plin: 'PLIN'
    };
    const igvCalc = venta.igv || 0;
    const totalSinRedondeo = venta.subtotal;
    const redondeo = (isFinite(venta.total) && isFinite(totalSinRedondeo)) ? venta.total - totalSinRedondeo : 0;
    const mostrarRedondeo = venta.paymentMethod === 'efectivo' && venta.aplicarRedondeo && Math.abs(redondeo) >= 0.01;
    const logoHtml = companyLogo
      ? `<img src="${companyLogo}" alt="Logo" style="width: 160px; height: auto; display: block; margin: 0 auto 4mm auto; max-height: 80px; object-fit: contain; background: white; padding: 6px; border-radius: 6px; filter: contrast(1.3) brightness(0.95);" />`
      : '';

    const css = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; font-size: 10px; line-height: 1.4; width: ${previewMode ? '100%' : '74mm'}; max-width: ${previewMode ? '520px' : 'none'}; margin: ${previewMode ? '0 auto' : '0'}; padding: 3mm 2mm; }
    .logo { text-align: center; margin-bottom: 3mm; }
    .header { text-align: center; margin-bottom: 3mm; }
    .header .empresa { font-size: 14px; font-weight: bold; letter-spacing: 0.5px; }
    .header .ruc { font-size: 10px; font-weight: 600; margin-top: 1mm; color: #000; }
    .header .direccion { font-size: 9px; font-weight: 600; color: #000; margin-top: 1mm; }
    .header .celular { font-size: 9px; font-weight: 600; color: #000; margin-top: 0.5mm; }
    .ticket-title { text-align: center; font-size: 12px; font-weight: bold; margin: 2mm 0 1.5mm 0; letter-spacing: 2px; }
    .info-line { display: flex; justify-content: space-between; font-size: 10px; font-weight: 600; margin: 0.5mm 0; }
    .divider { border-top: 1px dashed #888; margin: 1.5mm 0; }
    .solid-divider { border-top: 2px solid #000; margin: 1.5mm 0; }
    .product-header { text-align: left; display: flex; justify-content: space-between; font-size: 10px; font-weight: bold; margin-bottom: 0.5mm; }
    .product-row { text-align: left; margin: 0.3mm 0; }
    .total-section { margin-top: 1.5mm; }
    .total-line { display: flex; justify-content: space-between; font-size: 10px; font-weight: 600; margin: 0.3mm 0; }
    .total-line.bold { font-weight: bold; }
    .total-pagar { font-size: 14px; font-weight: bold; text-align: center; margin: 1.5mm 0; }
    .payment-line { font-size: 10px; font-weight: 600; margin: 0.3mm 0; }
    .footer { text-align: center; margin-top: 3mm; font-size: 10px; font-weight: bold; }
    `;

    const bodyContent = `
  ${logoHtml}
  <div class="header">
    <div class="empresa">${EMPRESA.razonSocial || 'EMPRESA SIN CONFIGURAR'}</div>
    <div class="ruc">${EMPRESA.ruc ? `RUC ${EMPRESA.ruc}` : 'RUC PENDIENTE'}</div>
    <div class="direccion">${EMPRESA.direccion || 'DIRECCION PENDIENTE'}</div>
    <div class="celular">${EMPRESA.telefono ? `CEL: ${EMPRESA.telefono}` : ''}</div>
  </div>

  <div class="ticket-title">BOLETA DE VENTA</div>

  <div class="divider"></div>

  <div class="info-line"><span>ID:</span><span>${venta.id}</span></div>
  <div class="info-line"><span>Emisión:</span><span>${fechaStr} ${horaStr}</span></div>

  <div class="divider"></div>

  <div class="product-header">
    <span>Cant. x Producto</span>
    <span>Total</span>
  </div>

  ${(() => {
    const regularItems = venta.items.filter(item => !item.selectedLevelName || item.selectedLevelName === 'Unidad');
    const levelItems = venta.items.filter(item => item.selectedLevelName && item.selectedLevelName !== 'Unidad');
    return [
      ...regularItems.map(item => `
        <div class="product-row">
          ${formatearProductoTicketHTML(item)}
        </div>
      `),
      ...(levelItems.length > 0 ? [
        `<div class="divider"></div>`,
        `<div style="font-size: 10px; font-weight: 900; text-align: center; padding: 4px 0; color: #000; letter-spacing: 1px;">=== POR MAYOR ===</div>`,
        ...levelItems.map(item => `
          <div class="product-row">
            ${formatearProductoTicketHTML(item)}
          </div>
        `)
      ] : [])
    ].join('');
  })()}

  <div class="divider"></div>

  <div class="total-section">
    <div class="total-line">
      <span>SUBTOTAL:</span>
      <span>S/ ${venta.subtotal.toFixed(2).padStart(7)}</span>
    </div>
    <div class="total-line">
      <span>IGV (${venta.igvRate || 18}%) incluido:</span>
      <span>S/ ${igvCalc.toFixed(2).padStart(7)}</span>
    </div>
    ${mostrarRedondeo ? `
    <div class="total-line">
      <span>REDONDEO:</span>
      <span>S/ ${redondeo.toFixed(2).padStart(7)}</span>
    </div>
    ` : ''}
  </div>

  <div class="solid-divider"></div>

  <div class="total-pagar">
    TOTAL A PAGAR: S/ ${venta.total.toFixed(2)}
  </div>

  <div class="solid-divider"></div>

  <div class="payment-line">MÉTODO DE PAGO: ${metodosPago[venta.paymentMethod]}</div>
  ${venta.paymentMethod === 'efectivo' ? `
  <div class="payment-line">Recibido: S/ ${(venta.amountPaid || 0).toFixed(2)}</div>
  <div class="payment-line">Cambio:   S/ ${(venta.change || 0).toFixed(2)}</div>
  ` : ''}

  <div class="solid-divider"></div>

  <div class="footer">¡GRACIAS POR SU COMPRA!</div>
  `;

    if (previewMode) {
      const scopedCss = css
        .split('\n')
        .map(line => {
          const l = line.trim();
          if (!l || l.startsWith('body')) return '';
          return '.boleta-preview ' + l;
        })
        .join('\n');
      return `<style>${scopedCss}</style><div class="boleta-preview" style="font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:10px;line-height:1.4;padding:3mm 2mm">${bodyContent}</div>`;
    }
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title></title>
  <style>
    @media print {
      @page { size: 80mm auto; margin: 0; orientation: portrait; }
      body { margin: 0; padding: 5mm 3mm; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
    ${css}
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;
  };

  const imprimirPorNavegador = (venta: Sale) => {
    const ventanaImpresion = window.open('', 'PRINT', 'height=800,width=400');
    if (ventanaImpresion) {
      ventanaImpresion.document.write(generarBoletaHTML(venta));
      ventanaImpresion.document.close();
      ventanaImpresion.focus();
      setTimeout(() => {
        ventanaImpresion.print();
      }, 200);
    }
  };

  const formatearProductoTicketHTML = (item: any) => {
    const cantidad = item.product.type === 'peso' 
      ? `${(item.quantity / 1000).toFixed(3)}kg`
      : `${item.quantity}`;
    const precio = (item.product.salePrice || 0).toFixed(2);
    let totalItem: number;
    if (item.product.type === 'peso') {
      totalItem = (item.product.salePricePerKg || 0) * (item.quantity / 1000);
    } else {
      totalItem = (item.product.salePrice || 0) * item.quantity;
    }
    const nombre = escapeHtml((item.product.name || '').substring(0, 18));
    const nivel = item.selectedLevelName ? ` (${escapeHtml(item.selectedLevelName)})` : '';
    const linea = `${cantidad} x ${nombre}${nivel}`;
    const dots = '.'.repeat(Math.max(1, 28 - linea.length));
    return `
      <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: 600; line-height: 1.5;">
        <span>${linea}</span>
        <span>${dots} S/ ${totalItem.toFixed(2).padStart(7)}</span>
      </div>
    `;
  };

  const imprimirTicket = async (venta: Sale) => {
    if (useQzPrint) {
      try {
        const printers = qzConnected ? qzPrinters : await conectarQZTray();
        if (printers.length === 0) throw new Error('QZ Tray no conectado');
        const printerName = selectedQzPrinter || printers[0];
        if (!printerName) throw new Error('No hay impresora seleccionada');
        const htmlData = generarBoletaHTML(venta);
        const config = qz.configs.create(printerName, {
          orientation: 0,
          paperSize: { width: '80mm', height: 'auto' }
        });
        const data = [{ type: 'html', format: 'plain', data: htmlData }];
        await qz.print(config, data);
        toast({ title: "Boleta impresa", description: "Impresión directa exitosa" });
      } catch (e) {
        toast({
          title: "Error de impresión directa",
          description: "Usando impresión por navegador",
          variant: "destructive"
        });
        imprimirPorNavegador(venta);
      }
    } else {
      imprimirPorNavegador(venta);
    }
  };

  const buscarProductoPorNombre = (name: string, excludeId?: string): Product | undefined => {
    const normalizado = name.trim().toLowerCase();
    return products.find(p => p.id !== excludeId && p.name.trim().toLowerCase() === normalizado);
  };

  const agregarProducto = async () => {
    if (!newProduct.name || newProduct.salePrice <= 0 || newProduct.purchasePrice <= 0 || newProduct.stock <= 0) {
      toast({
        title: "Datos incompletos",
        description: "Completa todos los campos del producto",
        variant: "destructive"
      });
      return;
    }
    if (newProduct.purchasePrice >= newProduct.salePrice) {
      toast({ title: "Precios inválidos", description: "El precio de compra debe ser menor al precio de venta", variant: "destructive" });
      return;
    }
    const duplicado = buscarProductoPorNombre(newProduct.name);
    if (duplicado) {
      toast({
        title: "Producto ya existe",
        description: `Ya existe "${duplicado.name}" (${duplicado.saleLevels?.length ? 'Mayorista' : 'General'}). Edítalo en vez de crear uno nuevo.`,
        variant: "destructive"
      });
      return;
    }

    let imageUrl: string | undefined = undefined;
    const nuevoProductoId = generateId();

    if (newProductImage) {
      try {
        imageUrl = await uploadProductImage(newProductImage, nuevoProductoId);
      } catch (error) {
        toast({
          title: "Error al procesar imagen",
          description: "Ocurrió un error al procesar la imagen.",
          variant: "destructive"
        });
        return;
      }
    }

    const producto: Product = {
      id: nuevoProductoId,
      name: newProduct.name,
      purchasePrice: newProduct.purchasePrice,
      salePrice: newProduct.salePrice,
      stock: newProduct.stock,
      initialStock: newProduct.stock,
      category: newProduct.category,
      type: 'unidad',
      imageUrl
    };

    const updatedProducts = [...products, producto];
    const updatedHistory = [...stockHistory, {
      id: generateId(),
      productId: producto.id,
      productName: producto.name,
      type: 'initial' as const,
      quantity: producto.initialStock ?? producto.stock,
      resultingStock: producto.stock,
      date: new Date().toISOString()
    }];
    addPendingId(PENDING.PRODUCTS, producto.id);
    setProducts(updatedProducts);
    safeSetItem('pos-products', JSON.stringify(updatedProducts));
    syncProductsToFirestore(updatedProducts);
    setStockHistory(updatedHistory);
    safeSetItem('pos-stock-history', JSON.stringify(updatedHistory));
    addPendingId(PENDING.HISTORY, updatedHistory[updatedHistory.length - 1].id);
      syncHistoryToFirestore(updatedHistory);
    
    setNewProduct({ name: '', purchasePrice: 0, salePrice: 0, stock: 0, category: '' });
    setIsAddProductOpen(false);
    setNewProductImage(null);
    setNewProductImagePreview('');
    
    toast({
      title: "Producto agregado",
      description: `${producto.name} agregado al inventario`,
    });
  };

  const editarProducto = (product: Product) => {
    if (product.type === 'peso') {
      const purchasePriceToUse = product.purchasePrice ?? product.purchasePricePerKg ?? 0;
      const salePriceToUse = product.salePrice ?? product.salePricePerKg ?? 0;
      setEditingWeightProduct({
        ...product,
        purchasePrice: purchasePriceToUse,
        salePrice: salePriceToUse,
        purchasePricePerKg: purchasePriceToUse,
        salePricePerKg: salePriceToUse
      });
      setEditPurchasePerKgInput(purchasePriceToUse.toFixed(2));
      setEditSalePerKgInput(salePriceToUse.toFixed(2));
      setIsEditWeightProductOpen(true);
    } else if (product.type === 'unidad' && product.saleLevels && product.saleLevels.length > 0) {
      editarProductoMayorista(product);
    } else {
      setEditingProduct(product);
      setIsEditProductOpen(true);
    }
  };

  const [editingMayoristaProduct, setEditingMayoristaProduct] = useState<Product | null>(null);
  const [isEditMayoristaOpen, setIsEditMayoristaOpen] = useState(false);
  const [editMayoristaName, setEditMayoristaName] = useState('');
  const [editMayoristaCategory, setEditMayoristaCategory] = useState('');
  const [editMayoristaLevels, setEditMayoristaLevels] = useState<SaleLevel[]>([]);
  const [editLevelStockInput, setEditLevelStockInput] = useState('');
  const [editLevelDropdown, setEditLevelDropdown] = useState('Paquete');
  const [editLevelCustomName, setEditLevelCustomName] = useState('');
  const [editLevelContains, setEditLevelContains] = useState('');
  const [editLevelPurchasePrice, setEditLevelPurchasePrice] = useState('');
  const [editLevelSalePrice, setEditLevelSalePrice] = useState('');
  const [editingLevelId, setEditingLevelId] = useState<string | null>(null);
  const [editLevelTempStock, setEditLevelTempStock] = useState('');
  const [editLevelTempSalePrice, setEditLevelTempSalePrice] = useState('');
  const [editLevelTempPurchasePrice, setEditLevelTempPurchasePrice] = useState('');

  const editarProductoMayorista = (product: Product) => {
    setEditingMayoristaProduct(product);
    setEditMayoristaName(product.name);
    setEditMayoristaCategory(product.category);
    setEditMayoristaLevels(product.saleLevels ? [...product.saleLevels].sort((a, b) => { if (a.name === 'Unidad') return -1; if (b.name === 'Unidad') return 1; return a.baseUnitsContained - b.baseUnitsContained; }) : []);
    setEditLevelDropdown('');
    setEditLevelContains('');
    setEditLevelPurchasePrice('');
    setEditLevelSalePrice('');
    setEditLevelStockInput('');
    setEditingLevelId(null);
    setEditLevelTempStock('');
    setEditLevelTempSalePrice('');
    setEditLevelTempPurchasePrice('');
    setIsEditMayoristaOpen(true);
  };

  const guardarEdicionMayorista = async () => {
    if (!editingMayoristaProduct) return;
    if (!editMayoristaName.trim()) {
      toast({ title: "Nombre requerido", description: "El nombre del producto no puede estar vacío", variant: "destructive" });
      return;
    }
    if (editMayoristaLevels.length === 0) {
      toast({ title: "Niveles requeridos", description: "Agrega al menos un nivel de venta", variant: "destructive" });
      return;
    }

    const hasSales = stockHistory.some(h => h.productId === editingMayoristaProduct.id && h.type === 'sale');
    const originalLevels = editingMayoristaProduct.saleLevels || [];

    if (hasSales) {
      const stockChanged = editMayoristaLevels.some(lvl => {
        const original = originalLevels.find(o => o.name === lvl.name);
        return original && original.stock !== lvl.stock;
      });
      if (stockChanged) {
        toast({ title: "Stock bloqueado", description: "No puedes editar el stock después de haber ventas. Usa 'Restock' en el Historial de Stock para ajustar el inventario.", variant: "destructive" });
        return;
      }
    }

    if (editingLevelId) {
      const lvl = editMayoristaLevels.find(l => l.id === editingLevelId);
      if (lvl) {
        const hasUnidadE = editMayoristaLevels.some(l => l.name === 'Unidad');
        const stockEditable = lvl.name === 'Unidad' || !hasUnidadE;
        const newStock = stockEditable ? parseInt(editLevelTempStock) : lvl.stock;
        const newSP = parseFloat(editLevelTempSalePrice);
        const newPP = parseFloat(editLevelTempPurchasePrice);
        if (!isNaN(newSP) && !isNaN(newPP) && (!stockEditable || (!isNaN(newStock) && newStock >= 0))) {
          const updatedLevels = editMayoristaLevels.map(l =>
            l.id === editingLevelId
              ? { ...l, stock: newStock, salePrice: newSP, purchasePrice: newPP }
              : l
          );
          setEditMayoristaLevels(updatedLevels);
          setEditingLevelId(null);
        }
      }
    }

    let imageUrl = editingMayoristaProduct.imageUrl;

    if (editProductImage) {
      try {
        imageUrl = await uploadProductImage(editProductImage, editingMayoristaProduct.id);
      } catch (error) {
        toast({
          title: "Error al procesar imagen",
          description: "Ocurrió un error al procesar la imagen",
          variant: "destructive"
        });
        return;
      }
    }

    const sortedLevels = [...editMayoristaLevels].sort((a, b) => { if (a.name === 'Unidad') return -1; if (b.name === 'Unidad') return 1; return a.baseUnitsContained - b.baseUnitsContained; });
    const hasUnidad = sortedLevels.some(l => l.name === 'Unidad');
    let totalUnits: number;
    if (hasUnidad) {
      const unidadLevel = sortedLevels.find(l => l.name === 'Unidad')!;
      totalUnits = sortedLevels.reduce((sum, l) => sum + l.stock * l.baseUnitsContained, 0);
    } else {
      totalUnits = sortedLevels.reduce((sum, l) => sum + l.stock * l.baseUnitsContained, 0);
    }
    const minLevel = sortedLevels.find(l => l.name === 'Unidad') || sortedLevels[0];
    const updatedProducts = products.map(p =>
      p.id === editingMayoristaProduct.id ? {
        ...p,
        name: editMayoristaName.trim(),
        category: editMayoristaCategory.trim(),
        saleLevels: sortedLevels.map(l => ({ ...l, initialStock: l.stock })),
        purchasePrice: minLevel?.purchasePrice || 0,
        salePrice: minLevel?.salePrice || 0,
        baseUnit: minLevel?.name || '',
        unitsPerBase: minLevel?.baseUnitsContained || 1,
        stock: totalUnits,
        initialStock: totalUnits,
        imageUrl,
        type: 'mayorista'
      } : p
    ) as Product[];
    setProducts(updatedProducts);
    safeSetItem('pos-products', JSON.stringify(updatedProducts));
    addPendingId(PENDING.PRODUCTS, editingMayoristaProduct.id);
    syncProductsToFirestore(updatedProducts);

    if (!hasSales) {
      const levelStockAfterMap = sortedLevels.reduce((acc, l) => ({ ...acc, [l.name]: l.stock }), {});
      const updatedHistory = stockHistory.map(item =>
        item.productId === editingMayoristaProduct.id && item.type === 'initial'
          ? { ...item, quantity: totalUnits, resultingStock: totalUnits, levelStockAfter: levelStockAfterMap, levelQuantities: levelStockAfterMap }
          : item
      );
      if (JSON.stringify(updatedHistory) !== JSON.stringify(stockHistory)) {
        setStockHistory(updatedHistory);
        safeSetItem('pos-stock-history', JSON.stringify(updatedHistory));
        addPendingId(PENDING.HISTORY, 'sync-' + editingMayoristaProduct.id);
        syncHistoryToFirestore(updatedHistory);
      }
    }

    setIsEditMayoristaOpen(false);
    setEditingMayoristaProduct(null);
    setEditProductImage(null);
    setEditProductImagePreview('');
    toast({
      title: "Producto mayorista actualizado",
      description: "Los cambios se guardaron correctamente",
    });
  };

  const guardarEdicionProductoPeso = async () => {
    if (!editingWeightProduct) return;

    if (!editingWeightProduct.name.trim()) {
      toast({ title: "Nombre requerido", description: "El nombre del producto no puede estar vacío", variant: "destructive" });
      return;
    }
    if ((editingWeightProduct.salePrice ?? editingWeightProduct.salePricePerKg ?? 0) <= 0) {
      toast({ title: "Precio de venta inválido", description: "Debe ser mayor a 0", variant: "destructive" });
      return;
    }
    if ((editingWeightProduct.purchasePrice ?? editingWeightProduct.purchasePricePerKg ?? 0) <= 0) {
      toast({ title: "Precio de compra inválido", description: "Debe ser mayor a 0", variant: "destructive" });
      return;
    }
    if ((editingWeightProduct.equivalentGrams ?? 0) <= 0) {
      toast({ title: "Gramos equivalentes inválidos", description: "Deben ser mayores a 0", variant: "destructive" });
      return;
    }
    if ((editingWeightProduct.minWeightGrams ?? 0) <= 0) {
      toast({ title: "Peso mínimo inválido", description: "Debe ser mayor a 0", variant: "destructive" });
      return;
    }
    if ((editingWeightProduct.purchasePrice ?? editingWeightProduct.purchasePricePerKg ?? 0) >= (editingWeightProduct.salePrice ?? editingWeightProduct.salePricePerKg ?? 0)) {
      toast({ title: "Precios inválidos", description: "El precio de compra debe ser menor al precio de venta", variant: "destructive" });
      return;
    }

    const oldProduct = products.find(p => p.id === editingWeightProduct.id);
    const hasSales = stockHistory.some(h => h.productId === editingWeightProduct.id && h.type === 'sale');
    if (hasSales && oldProduct && oldProduct.stock !== editingWeightProduct.stock) {
      toast({ title: "Stock bloqueado", description: "No puedes editar el stock después de haber ventas. Usa 'Restock' en el Historial de Stock para ajustar el inventario.", variant: "destructive" });
      return;
    }

    let imageUrl = editingWeightProduct.imageUrl;

    if (editProductImage) {
      try {
        imageUrl = await uploadProductImage(editProductImage, editingWeightProduct.id);
      } catch (error) {
        toast({
          title: "Error al procesar imagen",
          description: "Ocurrió un error al procesar la imagen",
          variant: "destructive"
        });
        return;
      }
    }

    const updatedProduct = { 
      ...editingWeightProduct, 
      imageUrl,
      purchasePrice: editingWeightProduct.purchasePrice ?? editingWeightProduct.purchasePricePerKg ?? 0,
      salePrice: editingWeightProduct.salePrice ?? editingWeightProduct.salePricePerKg ?? 0,
      purchasePricePerKg: editingWeightProduct.purchasePrice ?? editingWeightProduct.purchasePricePerKg ?? 0,
      salePricePerKg: editingWeightProduct.salePrice ?? editingWeightProduct.salePricePerKg ?? 0
    };

    if (oldProduct) {
      const oldSP = oldProduct.salePrice ?? oldProduct.salePricePerKg ?? 0;
      const newSP = updatedProduct.salePrice ?? updatedProduct.salePricePerKg ?? 0;
      const oldPP = oldProduct.purchasePrice ?? oldProduct.purchasePricePerKg ?? 0;
      const newPP = updatedProduct.purchasePrice ?? updatedProduct.purchasePricePerKg ?? 0;
      if (oldSP !== newSP || oldPP !== newPP) {
        const priceChangeEntry: StockHistoryItem = {
          id: generateId(),
          productId: editingWeightProduct.id,
          productName: editingWeightProduct.name,
          type: 'price_change',
          quantity: 0,
          resultingStock: 0,
          date: new Date().toISOString(),
          priceChanges: [{
            levelName: 'Peso',
            oldSalePrice: oldSP,
            newSalePrice: newSP,
            oldPurchasePrice: oldPP,
            newPurchasePrice: newPP
          }]
        };
        const updatedHistory = [...stockHistory, priceChangeEntry];
        setStockHistory(updatedHistory);
        safeSetItem('pos-stock-history', JSON.stringify(updatedHistory));
        addPendingId(PENDING.HISTORY, priceChangeEntry.id);
        syncHistoryToFirestore(updatedHistory);
      }
    }

    const updatedProducts = products.map(p => 
      p.id === editingWeightProduct.id ? updatedProduct : p
    );
    
    setProducts(updatedProducts);
    safeSetItem('pos-products', JSON.stringify(updatedProducts));
    addPendingId(PENDING.PRODUCTS, editingWeightProduct.id);
    syncProductsToFirestore(updatedProducts);
    setIsEditWeightProductOpen(false);
    setEditingWeightProduct(null);
    setEditProductImage(null);
    setEditProductImagePreview('');
    
    toast({
      title: "Producto actualizado",
      description: "Los cambios se guardaron correctamente",
    });
  };

  const guardarEdicionProducto = async () => {
    if (!editingProduct) return;

    if (!editingProduct.name.trim()) {
      toast({ title: "Nombre requerido", description: "El nombre del producto no puede estar vacío", variant: "destructive" });
      return;
    }
    if (editingProduct.salePrice <= 0 || editingProduct.purchasePrice <= 0) {
      toast({ title: "Precios inválidos", description: "Los precios deben ser mayores a 0", variant: "destructive" });
      return;
    }
    if (editingProduct.purchasePrice >= editingProduct.salePrice) {
      toast({ title: "Precios inválidos", description: "El precio de compra debe ser menor al precio de venta", variant: "destructive" });
      return;
    }
    if (typeof editingProduct.stock !== 'number' || !Number.isFinite(editingProduct.stock) || editingProduct.stock < 0) {
      toast({ title: "Stock inválido", description: "El stock no puede ser negativo", variant: "destructive" });
      return;
    }

    const oldProduct = products.find(p => p.id === editingProduct.id);
    const hasSales = stockHistory.some(h => h.productId === editingProduct.id && h.type === 'sale');
    if (hasSales && oldProduct && oldProduct.stock !== editingProduct.stock) {
      toast({ title: "Stock bloqueado", description: "No puedes editar el stock después de haber ventas. Usa 'Restock' en el Historial de Stock para ajustar el inventario.", variant: "destructive" });
      return;
    }

    let imageUrl = editingProduct.imageUrl;

    if (editProductImage) {
      try {
        imageUrl = await uploadProductImage(editProductImage, editingProduct.id);
      } catch (error) {
        toast({
          title: "Error al procesar imagen",
          description: "Ocurrió un error al procesar la imagen",
          variant: "destructive"
        });
        return;
      }
    }

    const updatedProduct = { ...editingProduct, imageUrl };

    if (oldProduct) {
      const oldSP = oldProduct.salePrice ?? 0;
      const newSP = editingProduct.salePrice ?? 0;
      const oldPP = oldProduct.purchasePrice ?? 0;
      const newPP = editingProduct.purchasePrice ?? 0;
      if (oldSP !== newSP || oldPP !== newPP) {
        const priceChangeEntry: StockHistoryItem = {
          id: generateId(),
          productId: editingProduct.id,
          productName: editingProduct.name,
          type: 'price_change',
          quantity: 0,
          resultingStock: 0,
          date: new Date().toISOString(),
          priceChanges: [{
            levelName: 'Unidad',
            oldSalePrice: oldSP,
            newSalePrice: newSP,
            oldPurchasePrice: oldPP,
            newPurchasePrice: newPP
          }]
        };
        const updatedHistory = [...stockHistory, priceChangeEntry];
        setStockHistory(updatedHistory);
        safeSetItem('pos-stock-history', JSON.stringify(updatedHistory));
        addPendingId(PENDING.HISTORY, priceChangeEntry.id);
        syncHistoryToFirestore(updatedHistory);
      }
    }

    const updatedProducts = products.map(p => 
      p.id === editingProduct.id ? updatedProduct : p
    );
    
    setProducts(updatedProducts);
    safeSetItem('pos-products', JSON.stringify(updatedProducts));
    addPendingId(PENDING.PRODUCTS, editingProduct.id);
    syncProductsToFirestore(updatedProducts);
    setIsEditProductOpen(false);
    setEditingProduct(null);
    setEditProductImage(null);
    setEditProductImagePreview('');
    
    toast({
      title: "Producto actualizado",
      description: "Los cambios se guardaron correctamente",
    });
  };

  const verProductoMayorista = (product: Product) => {
    setViewingMayoristaProduct(product);
    setIsViewMayoristaProductOpen(true);
  };

  const eliminarProducto = async (productId: string) => {
    const inCart = currentSale.some(item => item.product.id === productId);
    if (inCart) {
      setCurrentSale(currentSale.filter(item => item.product.id !== productId));
    }
    removePendingId(PENDING.PRODUCTS, productId);
    try { await deleteProduct(productId); } catch (e) { console.error('ERROR eliminarProducto:', e); }
    const updatedProducts = products.filter(p => p.id !== productId);
    setProducts(updatedProducts);
    safeSetItem('pos-products', JSON.stringify(updatedProducts));
    syncProductsToFirestore(updatedProducts);
    const updatedHistory = stockHistory.filter(h => h.productId !== productId);
    setStockHistory(updatedHistory);
    safeSetItem('pos-stock-history', JSON.stringify(updatedHistory));
    syncHistoryToFirestore(updatedHistory);
    
    toast({
      title: "Producto eliminado",
      description: "El producto se eliminó del inventario",
    });
  };

  const deleteSelectedProducts = async () => {
    if (!(await esAdminActual())) {
      toast({
        title: "Sin permiso",
        description: "Solo un administrador puede eliminar productos",
        variant: "destructive"
      });
      return;
    }

    const inCartIds = selectedProductsToDelete.filter(id => currentSale.some(item => item.product.id === id));
    if (inCartIds.length > 0) {
      setCurrentSale(currentSale.filter(item => !selectedProductsToDelete.includes(item.product.id)));
    }
    selectedProductsToDelete.forEach(id => removePendingId(PENDING.PRODUCTS, id));
    await Promise.all(selectedProductsToDelete.map(id => deleteProduct(id).catch(e => console.error('ERROR deleteProduct:', e))));
    const updatedProducts = products.filter(p => !selectedProductsToDelete.includes(p.id));
    setProducts(updatedProducts);
    safeSetItem('pos-products', JSON.stringify(updatedProducts));
    syncProductsToFirestore(updatedProducts);
    const updatedHistory = stockHistory.filter(h => !selectedProductsToDelete.includes(h.productId));
    setStockHistory(updatedHistory);
    safeSetItem('pos-stock-history', JSON.stringify(updatedHistory));
    syncHistoryToFirestore(updatedHistory);
    
    setSelectedProductsToDelete([]);
    setIsDeleteMode(false);
    setIsDeleteConfirmOpen(false);
    
    toast({
      title: "Productos eliminados",
      description: `${selectedProductsToDelete.length} productos han sido eliminados del inventario`,
    });
  };

  const confirmDeleteProduct = async () => {
    if (!productToDelete) return;

    if (!(await esAdminActual())) {
      toast({
        title: "Sin permiso",
        description: "Solo un administrador puede eliminar productos",
        variant: "destructive"
      });
      return;
    }

    const inCart = currentSale.some(item => item.product.id === productToDelete.id);
    if (inCart) {
      setCurrentSale(currentSale.filter(item => item.product.id !== productToDelete.id));
    }
    removePendingId(PENDING.PRODUCTS, productToDelete.id);
    try { await deleteProduct(productToDelete.id); } catch (e) { console.error('ERROR confirmDeleteProduct:', e); }
    const updatedProducts = products.filter(p => p.id !== productToDelete.id);
    setProducts(updatedProducts);
    safeSetItem('pos-products', JSON.stringify(updatedProducts));
    syncProductsToFirestore(updatedProducts);
    const updatedHistory = stockHistory.filter(h => h.productId !== productToDelete.id);
    setStockHistory(updatedHistory);
    safeSetItem('pos-stock-history', JSON.stringify(updatedHistory));
    syncHistoryToFirestore(updatedHistory);
    
    setIsDeleteProductConfirmOpen(false);
    setProductToDelete(null);

    toast({
      title: "Producto eliminado",
      description: "El producto se eliminó del inventario",
    });
  };

  const saveQuickEdit = () => {
    if (!editingQuickProduct) return;

    if (!editingQuickProduct.name.trim()) {
      toast({ title: "Nombre requerido", description: "El nombre del producto no puede estar vacío", variant: "destructive" });
      return;
    }
    if (editingQuickProduct.salePrice <= 0 || editingQuickProduct.purchasePrice <= 0) {
      toast({ title: "Precios inválidos", description: "Los precios deben ser mayores a 0", variant: "destructive" });
      return;
    }
    if (editingQuickProduct.purchasePrice >= editingQuickProduct.salePrice) {
      toast({ title: "Precios inválidos", description: "El precio de compra debe ser menor al precio de venta", variant: "destructive" });
      return;
    }
    if (typeof editingQuickProduct.stock !== 'number' || !Number.isFinite(editingQuickProduct.stock) || editingQuickProduct.stock < 0) {
      toast({ title: "Stock inválido", description: "El stock no puede ser negativo", variant: "destructive" });
      return;
    }

    const updatedProducts = products.map(p => 
      p.id === editingQuickProduct.id ? editingQuickProduct : p
    );
    
    setProducts(updatedProducts);
    safeSetItem('pos-products', JSON.stringify(updatedProducts));
    addPendingId(PENDING.PRODUCTS, editingQuickProduct.id);
    syncProductsToFirestore(updatedProducts);
    setIsEditQuickProductOpen(false);
    setEditingQuickProduct(null);
    
    toast({
      title: "Producto actualizado",
      description: "Los cambios se guardaron correctamente",
    });
  };

  const limpiarFormularioPeso = () => {
    setNewWeightProduct({ 
      name: "", 
      purchasePrice: 0,
      salePrice: 0,
      purchasePricePerKg: 0, 
      salePricePerKg: 0, 
      equivalentGrams: 0, 
      stock: 0, 
      initialStock: 0,
      minWeightGrams: 0, 
      category: "" 
    });
    setPurchasePerKgInput('');
    setSalePerKgInput('');
    setEquivalentGramsInput('');
    setEquivalentGramsError('');
    setMinWeightInput('');
    setMinWeightError('');
  };

  const limpiarFormularioMayorista = () => {
    setNewMayoristaProduct({
      name: '',
      category: '',
      initialStock: 0
    });
    setNewMayoristaLevels([]);
    setNewLevelDropdown('Paquete');
    setNewLevelContains('');
    setNewLevelPurchasePrice('');
    setNewLevelSalePrice('');
    setNewLevelStockInput('');
  };

  const limpiarFormularioAgregarProducto = () => {
    setNewProduct({ name: '', purchasePrice: 0, salePrice: 0, stock: 0, category: '' });
    setUnitPurchaseInput('');
    setUnitSaleInput('');
    limpiarFormularioPeso();
    limpiarFormularioMayorista();
    setNewProductImage(null);
    setNewProductImagePreview('');
  };

  const agregarProductoMayorista = async () => {
    if (isMayoristaFormInvalid) {
      toast({
        title: "Datos incompletos",
        description: "Completa correctamente todos los campos y agrega al menos un nivel de venta.",
        variant: "destructive"
      });
      return;
    }
    const duplicadoMayorista = buscarProductoPorNombre(newMayoristaProduct.name);
    if (duplicadoMayorista) {
      toast({
        title: "Producto ya existe",
        description: `Ya existe "${duplicadoMayorista.name}" (${duplicadoMayorista.saleLevels?.length ? 'Mayorista' : 'General'}). Edítalo en vez de crear uno nuevo.`,
        variant: "destructive"
      });
      return;
    }

    let imageUrl: string | undefined = undefined;
    const tempId = Date.now().toString();

    if (newProductImage) {
      try {
        imageUrl = await uploadProductImage(newProductImage, tempId);
      } catch (error) {
        toast({
          title: "Error al procesar imagen",
          description: "Ocurrió un error al procesar la imagen.",
          variant: "destructive"
        });
        return;
      }
    }

    const sortedLevels = [...newMayoristaLevels].sort((a, b) => { if (a.name === 'Unidad') return -1; if (b.name === 'Unidad') return 1; return a.baseUnitsContained - b.baseUnitsContained; });
    const hasUnidad = sortedLevels.some(l => l.name === 'Unidad');
    let totalUnits: number;
    let initialTotalUnits: number;
    let productType: 'mayorista' | 'unidad' = 'mayorista';
    if (hasUnidad) {
      const unidadLevel = sortedLevels.find(l => l.name === 'Unidad')!;
      totalUnits = sortedLevels.reduce((sum, l) => sum + l.stock * l.baseUnitsContained, 0);
      initialTotalUnits = sortedLevels.reduce((sum, l) => sum + l.initialStock * l.baseUnitsContained, 0);
    } else {
      totalUnits = sortedLevels.reduce((sum, l) => sum + l.stock * l.baseUnitsContained, 0);
      initialTotalUnits = sortedLevels.reduce((sum, l) => sum + l.initialStock * l.baseUnitsContained, 0);
    }
    productType = 'mayorista';
    const minLevel = sortedLevels.find(l => l.name === 'Unidad') || sortedLevels[0];

    const productToAdd: Product = {
      id: tempId,
      name: newMayoristaProduct.name.trim(),
      purchasePrice: minLevel.purchasePrice,
      salePrice: minLevel.salePrice,
      stock: totalUnits,
      initialStock: initialTotalUnits,
      category: newMayoristaProduct.category.trim(),
      type: productType,
      imageUrl,
      baseUnit: minLevel.name,
      unitsPerBase: minLevel.baseUnitsContained,
      saleLevels: sortedLevels
    };

    const updatedProducts = [...products, productToAdd];
    const levelDescText = sortedLevels
      .filter(l => l.initialStock > 0)
      .map(l => `${l.initialStock} ${l.name}${l.initialStock > 1 ? 's' : ''} (${l.baseUnitsContained} unid. c/u)`)
      .join(', ');
    const updatedHistory = [...stockHistory, {
      id: generateId(),
      productId: productToAdd.id,
      productName: productToAdd.name,
      type: 'initial' as const,
      quantity: productToAdd.initialStock ?? productToAdd.stock,
      resultingStock: productToAdd.stock,
      date: new Date().toISOString(),
      isInitial: true,
      levelQuantities: sortedLevels.reduce((acc, l) => ({ ...acc, [l.name]: l.initialStock }), {}),
      levelDescription: `stock inicial: ${levelDescText}`,
      levelStockAfter: sortedLevels.reduce((acc, l) => ({ ...acc, [l.name]: l.initialStock }), {})
    }];
    setProducts(updatedProducts);
    safeSetItem('pos-products', JSON.stringify(updatedProducts));
    addPendingId(PENDING.PRODUCTS, productToAdd.id);
    syncProductsToFirestore(updatedProducts);
    setStockHistory(updatedHistory);
    safeSetItem('pos-stock-history', JSON.stringify(updatedHistory));
    addPendingId(PENDING.HISTORY, updatedHistory[updatedHistory.length - 1].id);
      syncHistoryToFirestore(updatedHistory);
    
    limpiarFormularioAgregarProducto();
    setIsAddProductOpen(false);
    
    toast({
      title: "Producto agregado",
      description: `${productToAdd.name} agregado al inventario`,
    });
  };

  const agregarProductoPeso = async () => {
    if (isWeightFormInvalid) {
      toast({
        title: "Datos incompletos",
        description: equivalentGramsError || minWeightError || "Completa correctamente todos los campos del producto por peso.",
        variant: "destructive"
      });
      return;
    }
    if (newWeightProduct.purchasePricePerKg >= newWeightProduct.salePricePerKg) {
      toast({ title: "Precios inválidos", description: "El precio de compra debe ser menor al precio de venta", variant: "destructive" });
      return;
    }
    const duplicadoPeso = buscarProductoPorNombre(newWeightProduct.name);
    if (duplicadoPeso) {
      toast({
        title: "Producto ya existe",
        description: `Ya existe "${duplicadoPeso.name}" (${duplicadoPeso.saleLevels?.length ? 'Mayorista' : 'General'}). Edítalo en vez de crear uno nuevo.`,
        variant: "destructive"
      });
      return;
    }

    const nuevoProductoPesoId = generateId();
    let imageUrl: string | undefined = undefined;
    if (newProductImage) {
      try {
        imageUrl = await uploadProductImage(newProductImage, nuevoProductoPesoId);
      } catch (error) {
        toast({
          title: "Error al procesar imagen",
          description: "Ocurrió un error al procesar la imagen.",
          variant: "destructive"
        });
        return;
      }
    }

    const productToAdd: Product = {
      id: nuevoProductoPesoId,
      name: newWeightProduct.name,
      purchasePrice: newWeightProduct.purchasePrice,
      salePrice: newWeightProduct.salePrice, 
      stock: newWeightProduct.initialStock, 
      initialStock: newWeightProduct.initialStock, 
      category: newWeightProduct.category,
      type: 'peso',
      imageUrl,
      purchasePricePerKg: newWeightProduct.purchasePrice,
      salePricePerKg: newWeightProduct.salePrice,
      equivalentGrams: newWeightProduct.equivalentGrams,
      minWeightGrams: newWeightProduct.minWeightGrams,
    };
    const updatedProducts = [...products, productToAdd];
    const updatedHistory = [...stockHistory, {
      id: generateId(),
      productId: productToAdd.id,
      productName: productToAdd.name,
      type: 'initial' as const,
      quantity: productToAdd.initialStock ?? productToAdd.stock,
      resultingStock: productToAdd.stock,
      date: new Date().toISOString()
    }];
    setProducts(updatedProducts);
    safeSetItem('pos-products', JSON.stringify(updatedProducts));
    addPendingId(PENDING.PRODUCTS, productToAdd.id);
    syncProductsToFirestore(updatedProducts);
    setStockHistory(updatedHistory);
    safeSetItem('pos-stock-history', JSON.stringify(updatedHistory));
    addPendingId(PENDING.HISTORY, updatedHistory[updatedHistory.length - 1].id);
      syncHistoryToFirestore(updatedHistory);
    limpiarFormularioAgregarProducto();
    setIsAddProductOpen(false);
    toast({
      title: "Producto por peso agregado",
      description: `${productToAdd.name} agregado al inventario`,
    });
  };

  /**
   * Alta de usuarios. Intenta crearlo con la Supabase Edge Function
   * 'crear-usuario' (la clave de servicio vive solo en el servidor). Si la
   * funcion no esta desplegada, cae en el aviso de siempre: copiar el correo
   * y darlo de alta desde el panel de Supabase.
   */
  const agregarUsuario = async () => {
    if (!newUser.name?.trim() || !newUser.email?.trim()) {
      toast({
        title: "Datos incompletos",
        description: "Completa nombre y correo del usuario",
        variant: "destructive"
      });
      return;
    }

    const errores: Record<string, string> = {};
    if (!newUser.name?.trim()) errores.name = 'Requerido';
    if (!newUser.email?.trim()) errores.email = 'Requerido';
    if (!newUser.password) {
      errores.password = 'Define una contraseña';
    } else if (newUser.password.length < 6) {
      errores.password = 'Mínimo 6 caracteres';
    }
    if (newUser.password !== confirmPassword) {
      errores.confirmPassword = 'No coincide';
    }
    setFieldErrors(errores);
    if (Object.keys(errores).length > 0) return;

    const correo = newUser.email.trim();
    try {
      await crearUsuarioPorAdmin({
        email: correo,
        password: newUser.password,
        nombre: newUser.name.trim(),
        rol: newUser.role,
      });
      const actualizados = await getAllLocalUsers().catch(() => null as any);
      if (actualizados) setUsers(actualizados);
      setIsAddUserOpen(false);
      setNewUser({ password: '', name: '', role: 'empleado', email: '' });
      setConfirmPassword('');
      setFieldErrors({});
      toast({
        title: "Usuario creado",
        description: `La cuenta ${correo} ya puede iniciar sesión con la contraseña indicada.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      try {
        await navigator.clipboard.writeText(correo);
      } catch { /* el portapapeles puede estar bloqueado */ }
      setIsAddUserOpen(false);
      setNewUser({ password: '', name: '', role: 'empleado', email: '' });
      setConfirmPassword('');
      setFieldErrors({});
      toast({
        title: "No se pudo crear desde la app",
        description:
          `${msg} Crea la cuenta "${correo}" en Supabase > Authentication > Users > Add user ` +
          `(correo copiado). El rol lo verás aquí al recargar.`,
        variant: "destructive",
        duration: 12000,
      });
    }
  };

  const editarUsuario = (user: AppUser) => {
    setEditingUser({ ...user, password: '' });
    setIsEditUserOpen(true);
  };

  const guardarEdicionUsuario = async () => {
    if (!editingUser) return;

    const usuarioActual = getCurrentSupabaseUser();
    const miEmail = usuarioActual?.email ?? null;

    // No permitir que un admin se degrade a si mismo ni elimine el propio estado.
    if (editingUser.email === miEmail && editingUser.role !== 'admin') {
      toast({
        title: "No puedes quitar tu propio rol",
        description: "Un administrador no puede degradarse a sí mismo.",
        variant: "destructive",
      });
      return;
    }

    // Nombre y rol se guardan en la base. La contraseña la administra Supabase
    // (correo de recuperacion o panel), nunca la app.
    try {
      await updateUserProfile(editingUser.firebaseUid ?? editingUser.id, {
        displayName: editingUser.name,
        role: editingUser.role,
      });
    } catch (err: unknown) {
      console.error('Error al actualizar perfil:', err);
      toast({
        title: "No se pudo guardar",
        description: err instanceof Error ? err.message : "Error desconocido",
        variant: "destructive",
      });
      return;
    }

    const actualizados = await getAllLocalUsers().catch(() => null as any);
    if (actualizados) setUsers(actualizados);
    setIsEditUserOpen(false);
    setEditingUser(null);

    toast({
      title: "Usuario actualizado",
      description: "El nombre y el rol se guardaron. La contraseña se cambia en Supabase o con el correo de recuperación.",
    });
  };

  const eliminarUsuario = async (userId: string) => {
    // Defensa doble: los administradores jamas se bloquean desde la app.
    const blanco = users.find(u => u.id === userId) ?? usuarioAEliminar;
    if (blanco?.role === 'admin') {
      toast({
        title: "Operación no permitida",
        description: "Los administradores no se pueden eliminar desde la app. Hazlo desde el panel de Supabase si es necesario.",
        variant: "destructive",
      });
      return;
    }
    try { await deleteLocalUser(userId); } catch (e) { console.error('ERROR deleteLocalUser:', e); }
    removePendingId(PENDING.USERS, userId);
    const user = users.find(u => u.id === userId) ?? usuarioAEliminar;
    if (user?.firebaseUid) {
      try {
        await deleteUserProfile(user.firebaseUid);
      } catch (err: unknown) {
        console.error('Error al eliminar perfil:', err);
      }
    }

    const actualizados = await getAllLocalUsers().catch(() => null as any);
    if (actualizados) setUsers(actualizados);
    setUsuarioAEliminar(null);

    toast({
      title: "Usuario bloqueado",
      description: `${user?.name ?? 'El empleado'} ya no puede entrar. Para quitarle el acceso por completo, bórralo también en Supabase > Authentication > Users.`,
      duration: 8000,
    });
  };

  const cerrarCaja = () => {
    const today = getLocalDateStr(new Date());
    const todaySales = sales.filter(sale => 
      (sale.localDate || getLocalDateStr(new Date(sale.date))) === today
    );

    if (todaySales.length === 0) {
      toast({
        title: "No hay ventas",
        description: "No hay ventas registradas para cerrar la caja",
        variant: "destructive"
      });
      return;
    }

    const totalSales = todaySales.reduce((sum, sale) => sum + (sale.total || 0), 0);
    const totalProfit = todaySales.reduce((sum, sale) => sum + (sale.totalProfit || 0), 0);
    const totalItems = todaySales.reduce((sum, sale) => 
      sum + (sale.items || []).reduce((itemSum, item) => {
        return item?.product?.type === 'peso' ? itemSum + 1 : itemSum + (item?.quantity || 0);
      }, 0), 0
    );

    const paymentMethods = {
      efectivo: todaySales.filter(s => s.paymentMethod === 'efectivo').reduce((sum, s) => sum + (s.total || 0), 0),
      tarjeta: todaySales.filter(s => s.paymentMethod === 'tarjeta').reduce((sum, s) => sum + (s.total || 0), 0),
      yape: todaySales.filter(s => s.paymentMethod === 'yape').reduce((sum, s) => sum + (s.total || 0), 0),
      plin: todaySales.filter(s => s.paymentMethod === 'plin').reduce((sum, s) => sum + (s.total || 0), 0)
    };

    const currentUserName = firebaseUser?.displayName || users.find(u => u.email === getCurrentSupabaseUser()?.email)?.name || userRole;

    const existingCloseIndex = dailyCloses.findIndex(c => c.date === today);
    let updatedCloses: DailyClose[];
    let closeId: string;
    if (existingCloseIndex >= 0) {
      const existingClose = dailyCloses[existingCloseIndex];
      closeId = existingClose.id;
      const updatedClose: DailyClose = {
        ...existingClose,
        totalSales,
        totalProfit,
        totalItems,
        salesCount: todaySales.length,
        paymentMethods,
        closedBy: currentUserName,
        closeTime: new Date().toISOString(),
        transacciones: todaySales
      };
      updatedCloses = [...dailyCloses];
      updatedCloses[existingCloseIndex] = updatedClose;
      toast({
        title: "Cierre actualizado",
        description: `Se actualizó el cierre de hoy: S/ ${totalSales.toFixed(2)} en ventas`,
      });
    } else {
      closeId = Date.now().toString();
      const dailyClose: DailyClose = {
        id: closeId,
        date: today,
        totalSales,
        totalProfit,
        totalItems,
        salesCount: todaySales.length,
        paymentMethods,
        closedBy: currentUserName,
        closeTime: new Date().toISOString(),
        transacciones: todaySales
      };
      updatedCloses = [...dailyCloses, dailyClose];
      toast({
        title: "Caja cerrada",
        description: `Resumen del día guardado: S/ ${totalSales.toFixed(2)} en ventas`,
      });
    }

    setDailyCloses(updatedCloses);
    safeSetItem('pos-daily-closes', JSON.stringify(updatedCloses));
    addPendingId(PENDING.CLOSES, closeId);
    syncClosesToFirestore(updatedCloses);
    setIsCloseCashOpen(false);
  };

  const confirmClearTodaySales = async () => {
    if (!(await esAdminActual())) {
      toast({ title: "Sin permiso", description: "Solo un administrador puede limpiar las ventas del dia", variant: "destructive" });
      return;
    }
    const today = getLocalDateStr(new Date());
    const todaySales = sales.filter(s => getLocalDateStr(new Date(s.date)) === today);
    const todaySalesIds = todaySales.map(s => s.id);
    if (todaySalesIds.length === 0) {
      toast({ title: "Sin ventas", description: "No hay ventas del día para eliminar", variant: "destructive" });
      setIsClearSalesOpen(false);
      return;
    }

    for (const id of todaySalesIds) {
      try { await deleteSale(id); } catch (e) { console.error('ERROR deleteSale:', e); }
      removePendingId(PENDING.SALES, id);
    }
    const updatedSales = sales.filter(s => !todaySalesIds.includes(s.id));
    setSales(updatedSales);
    safeSetItem('pos-sales', JSON.stringify(updatedSales));
    syncSalesToFirestore(updatedSales);
    toast({ title: "Ventas eliminadas", description: `Se eliminaron ${todaySalesIds.length} ventas del día.` });
    setIsClearSalesOpen(false);
  };

  const viewCloseDetail = (dailyClose: DailyClose) => {
    try {
      setSelectedCloseDetail(dailyClose);
      setIsCloseDetailOpen(true);
    } catch (error) {
      console.error('Error al abrir detalle de cierre:', error);
      toast({
        title: "Error",
        description: "No se pudo abrir el detalle del cierre",
        variant: "destructive"
      });
    }
  };

  const formatCloseTime = (closeTime: string) => {
    if (!closeTime) return 'N/A';
    // ISO 8601 format (new format)
    const isoMatch = closeTime.match(/^\d{4}-\d{2}-\d{2}T/);
    if (isoMatch) {
      const d = new Date(closeTime);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
      }
    }
    // Legacy locale format
    const time = closeTime.trim();
    const hasMeridiem = /(AM|PM|a\.? m\.?|p\.? m\.?)/i.test(time);
    if (hasMeridiem) return time.replace(/\s+/g, ' ');
    const match = time.match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const d = new Date();
      d.setHours(hours, minutes, 0, 0);
      return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
    }
    return time;
  };

  const generateIndividualSalesPDF = (dailyClose: DailyClose) => {
    const daysSales = sales.filter(sale => 
      (sale.localDate || getLocalDateStr(new Date(sale.date))) === dailyClose.date
    );

    // Crear contenido de texto para descargar como archivo
    let textContent = `VENTAS INDIVIDUALES\n`;
    textContent += `Fecha: ${formatearFechaLocal(dailyClose.date)}\n`;
    textContent += `${'='.repeat(50)}\n\n`;
    
    if (daysSales.length === 0) {
      textContent += `No hay ventas registradas en esta fecha.\n`;
    } else {
      daysSales.forEach((sale, index) => {
        textContent += `VENTA #${index + 1}\n`;
        textContent += `Hora: ${new Date(sale.date).toLocaleTimeString('es-ES', { hour12: true, hour: '2-digit', minute: '2-digit' })}\n`;
        textContent += `Método de Pago: ${sale.paymentMethod.toUpperCase()}\n`;
        textContent += `${'-'.repeat(30)}\n`;
        
        sale.items.forEach(item => {
          const quantity = item.product?.type === 'peso' 
            ? formatWeight(item.quantity)
            : item.quantity;
          const price = item.product?.type === 'peso'
            ? `S/ ${((item.product.salePricePerKg || 0) * (item.quantity / 1000)).toFixed(2)}`
            : `S/ ${((item.product?.salePrice || 0) * item.quantity).toFixed(2)}`;
          
          textContent += `${item.product?.name || 'Producto sin nombre'}\n`;
          textContent += `  Cantidad: ${quantity} - ${price}\n`;
        });
        
        textContent += `${'-'.repeat(30)}\n`;
        textContent += `TOTAL: S/ ${sale.total.toFixed(2)}\n`;
        textContent += `\n`;
      });
      
      textContent += `${'='.repeat(50)}\n`;
      textContent += `RESUMEN DEL DÍA\n`;
      textContent += `Total de Ventas: ${daysSales.length}\n`;
      textContent += `Total Vendido: S/ ${dailyClose.totalSales.toFixed(2)}\n`;
    }

    // Crear y descargar archivo de texto
    try {
      const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ventas-individuales-${dailyClose.date}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error al generar el archivo:', error);
      toast({
        title: "Error",
        description: "Error al generar el archivo de ventas",
        variant: "destructive"
      });
    }
  };

  // Función para eliminar cierre de caja
  const openDeleteCloseDialog = (dailyClose: DailyClose) => {
    setCloseToDelete(dailyClose);
    setIsDeleteCloseOpen(true);
    setAdminPassword('');
  };

    const confirmDeleteDailyClose = async () => {
    if (!closeToDelete) return;

    if (!(await esAdminActual())) {
      toast({
        title: "Sin permiso",
        description: "Solo un administrador puede eliminar cierres de caja",
        variant: "destructive"
      });
      return;
    }


    // Eliminar el cierre de caja
    try { await deleteDailyClose(closeToDelete.id); } catch (e) { console.error('ERROR deleteDailyClose:', e); }
    removePendingId(PENDING.CLOSES, closeToDelete.id);
    const updatedCloses = dailyCloses.filter(c => c.id !== closeToDelete.id);
    setDailyCloses(updatedCloses);
    safeSetItem('pos-daily-closes', JSON.stringify(updatedCloses));
    syncClosesToFirestore(updatedCloses);
    
    setIsDeleteCloseOpen(false);
    setCloseToDelete(null);
    setAdminPassword('');
    
    toast({
      title: "Cierre eliminado",
      description: `El cierre del ${formatearFechaLocal(closeToDelete.date)} ha sido eliminado permanentemente`,
    });
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = normalizeText(product.name).includes(normalizeSearch(searchTerm)) ||
      normalizeText(product.category).includes(normalizeSearch(searchTerm));
    if (ventaMode === 'mayor') return matchesSearch && product.saleLevels?.length;
    return matchesSearch && !product.saleLevels?.length;
  });

  const filteredInventory = products.filter(product => {
    if (product.saleLevels?.length) return false;
    const matchesSearch = normalizeText(product.name).includes(normalizeSearch(inventorySearch)) ||
                         normalizeText(product.category).includes(normalizeSearch(inventorySearch));
    
    if (inventoryView === 'todos') return matchesSearch;
    if (inventoryView === 'unidad') return matchesSearch && product.type === 'unidad';
    if (inventoryView === 'peso') return matchesSearch && product.type === 'peso';
    
    return matchesSearch;
  });

  const filteredMayoristaProducts = products.filter(product =>
    product.saleLevels?.length > 0 &&
    (normalizeText(product.name).includes(normalizeSearch(mayoristaSearch)) ||
     normalizeText(product.category).includes(normalizeSearch(mayoristaSearch)))
  );

  const [salesFilter, setSalesFilter] = useState<'all' | 'regular' | 'mayorista'>('all');
  const [transaccionesFilter, setTransaccionesFilter] = useState<'all' | 'regular' | 'mayorista'>('all');
  const [resumenTab, setResumenTab] = useState<'regular' | 'mayorista'>('regular');
  const isMayoristaSale = (sale: Sale) => sale.items.some(item => item.product.type === 'mayorista' || (item.selectedLevelName && item.selectedLevelName !== 'Unidad'));
  const isRegularSale = (sale: Sale) => sale.items.some(item => item.product.type !== 'mayorista' && (!item.selectedLevelName || item.selectedLevelName === 'Unidad'));

  const todaysSales = sales.filter(sale => 
    (sale.localDate || getLocalDateStr(new Date(sale.date))) === getLocalDateStr(new Date())
  );
  const filteredTodaysSales = todaysSales.filter(sale => {
    let matchesFilter = true;
    if (salesFilter === 'regular') matchesFilter = isRegularSale(sale);
    if (salesFilter === 'mayorista') matchesFilter = isMayoristaSale(sale);
    let matchesSearch = true;
    if (salesSearch.trim()) {
      matchesSearch = normalizeText(sale.id).includes(normalizeSearch(salesSearch));
    }
    return matchesFilter && matchesSearch;
  });

  const calculateProductPurchaseValue = (product: Product) => {
    if (product.type === 'peso') {
      const purchasePrice = product.purchasePrice ?? product.purchasePricePerKg ?? 0;
      return purchasePrice * (product.stock / 1000);
    } else if (product.saleLevels?.length) {
      return product.saleLevels.reduce((total, level) => total + (level.stock * level.purchasePrice), 0);
    } else {
      return product.purchasePrice * product.stock;
    }
  };

  const calculateProductSaleValue = (product: Product) => {
    if (product.type === 'peso') {
      const salePrice = product.salePrice ?? product.salePricePerKg ?? 0;
      return salePrice * (product.stock / 1000);
    } else if (product.saleLevels?.length) {
      return product.saleLevels.reduce((total, level) => total + (level.stock * level.salePrice), 0);
    } else {
      return product.salePrice * product.stock;
    }
  };

  const calculateProductPotentialProfit = (product: Product) => {
    if (product.type === 'peso') {
      const purchasePrice = product.purchasePrice ?? product.purchasePricePerKg ?? 0;
      const salePrice = product.salePrice ?? product.salePricePerKg ?? 0;
      const profitPerKg = salePrice - purchasePrice;
      return profitPerKg * (product.stock / 1000);
    } else if (product.saleLevels?.length) {
      if (!product.saleLevels?.length) return 0;
      return product.saleLevels.reduce((total, level) => total + (level.stock * (level.salePrice - level.purchasePrice)), 0);
    } else {
      return (product.salePrice - product.purchasePrice) * product.stock;
    }
  };

  const inventoryTotals = {
    totalPurchaseValue: products
      .filter(p => !p.saleLevels?.length)
      .reduce((total, product) => total + calculateProductPurchaseValue(product), 0),

    totalSaleValue: products
      .filter(p => !p.saleLevels?.length)
      .reduce((total, product) => total + calculateProductSaleValue(product), 0),

    potentialProfit: products
      .filter(p => !p.saleLevels?.length)
      .reduce((total, product) => total + calculateProductPotentialProfit(product), 0)
  };

  const inventoryStats = {
    totalProducts: products.filter(p => !p.saleLevels?.length).length,
    unitProducts: products.filter(p => p.type === 'unidad').length,
    weightProducts: products.filter(p => p.type === 'peso').length,
    outOfStock: products.filter(p => !p.saleLevels?.length && p.stock === 0).length,
    lowStock: products.filter(p => !p.saleLevels?.length && p.stock > 0 && (p.type === 'peso' ? p.stock <= 500 : p.stock <= 20)).length,
    totalStockValue: products.filter(p => !p.saleLevels?.length).reduce((total, product) => {
      if (product.type === 'peso') {
        const salePrice = product.salePrice ?? product.salePricePerKg ?? 0;
        return total + (salePrice * (product.stock / 1000));
      } else {
        return total + (product.salePrice * product.stock);
      }
    }, 0)
  };

  const mayoristaProductSales: Record<string, number> = {};
  const mayoristaLevelSales: Record<string, number> = {};

  sales.forEach(sale => {
    sale.items.forEach(item => {
      if (item.product.type === 'mayorista' || (item.product.type === 'unidad' && item.selectedLevelName)) {
        mayoristaProductSales[item.product.id] = (mayoristaProductSales[item.product.id] || 0) + item.quantity;
        if (item.selectedLevelName) {
          mayoristaLevelSales[item.selectedLevelName] = (mayoristaLevelSales[item.selectedLevelName] || 0) + item.quantity;
        }
      }
    });
  });

  let topSoldProduct: { name: string; quantity: number } | null = null;
  let maxProductSales = 0;
  for (const [pid, qty] of Object.entries(mayoristaProductSales)) {
    if (qty > maxProductSales) {
      maxProductSales = qty;
      const product = products.find(p => p.id === pid);
      if (product) {
        topSoldProduct = { name: product.name, quantity: qty };
      }
    }
  }

  let topSoldLevel: { name: string; quantity: number } | null = null;
  let maxLevelSales = 0;
  for (const [name, qty] of Object.entries(mayoristaLevelSales)) {
    if (qty > maxLevelSales) {
      maxLevelSales = qty;
      topSoldLevel = { name, quantity: qty };
    }
  }

  const STOCK_BAJO_THRESHOLD = 5;

  const mayProdFilter = (p: Product) => p.saleLevels?.length > 0;

  const stockCriticoList = products
    .filter(mayProdFilter)
    .flatMap(p => {
      if (p.type === 'mayorista') {
        return (p.saleLevels || [])
          .filter(l => l.stock <= STOCK_BAJO_THRESHOLD)
          .map(l => ({ productName: p.name, levelName: l.name, stock: l.stock }));
      }
      if (p.stock <= STOCK_BAJO_THRESHOLD * 40) {
        const unidadLevel = p.saleLevels?.find(l => l.name === 'Unidad');
        return [{ productName: p.name, levelName: 'Stock total', stock: p.stock }];
      }
      return [];
    });

  const stockCriticoCount = products
    .filter(mayProdFilter)
    .filter(p => {
      if (p.type === 'mayorista') return (p.saleLevels || []).some(l => l.stock <= STOCK_BAJO_THRESHOLD);
      return p.stock <= STOCK_BAJO_THRESHOLD * 40;
    }).length;

  const inventarioValor = products
    .filter(mayProdFilter)
    .reduce((sum, p) => {
      if (p.type === 'unidad') return sum + p.stock * p.salePrice;
      return sum + (p.saleLevels || []).reduce((s, l) => s + l.stock * l.salePrice, 0);
    }, 0);

  const mayoristaStats = {
    totalProducts: products.filter(mayProdFilter).length,
    totalLevels: products.filter(mayProdFilter).reduce((sum, p) => sum + (p.saleLevels?.length || 0), 0),
    totalStock: products.filter(mayProdFilter).reduce((sum, p) => sum + p.stock, 0),
    potentialProfit: products.filter(mayProdFilter).reduce((sum, p) => sum + calculateProductPotentialProfit(p), 0),
    topSoldProduct,
    topSoldLevel,
    stockCriticoCount,
    inventarioValor
  };

  const getPaymentMethodColor = (method: string) => {
    switch(method) {
      case 'efectivo': return 'bg-green-100 text-green-800';
      case 'tarjeta': return 'bg-orange-100 text-orange-800';
      case 'yape': return 'bg-purple-100 text-purple-800';
      case 'plin': return 'bg-sky-100 text-sky-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const purchaseHeader = inventoryView === 'peso' ? 'Compra por kilo (S/)' : 'Compra por unidad (S/)';
  const saleHeader = inventoryView === 'peso' ? 'Venta por kilo (S/)' : 'Venta por unidad (S/)';

  const viewSaleDetail = (sale: Sale) => {
    setSelectedSaleDetail(sale);
    setIsDetailOpen(true);
  };

  const viewBoleta = (sale: Sale) => {
    setSelectedBoletaSale(sale);
    setBoletaPreviewHTML(generarBoletaHTML(sale, true));
    setIsBoletaPreviewOpen(true);
  };

  const reimprimirBoleta = (sale: Sale) => {
    imprimirTicket(sale);
  };

  if (!isAuthenticated) {
    if (showResetPasswordForm) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/20 blur-[120px] rounded-full" />
          <Card className="w-full max-w-md border-slate-800 bg-slate-900/50 backdrop-blur-xl shadow-2xl overflow-hidden relative z-10">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50" />
            <CardHeader className="text-center pb-2 pt-10">
              <div className="mx-auto w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-2xl shadow-indigo-500/20">
                <Lock className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-black text-white tracking-tighter">
                Nueva <span className="text-indigo-500">Contraseña</span>
              </CardTitle>
              <p className="text-sm text-slate-400 mt-2">Escribe tu nueva contraseña para volver a entrar.</p>
            </CardHeader>
            <CardContent className="space-y-5 pt-6 px-8 pb-10">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Nueva Contraseña</Label>
                <Input
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={nuevaPassword}
                  onChange={(e) => setNuevaPassword(e.target.value)}
                  className="h-11 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-600 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Confirmar Contraseña</Label>
                <Input
                  type="password"
                  placeholder="Repite la contraseña"
                  value={nuevaPassword2}
                  onChange={(e) => setNuevaPassword2(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleGuardarNuevaPassword()}
                  className="h-11 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-600 rounded-xl"
                />
              </div>
              <Button
                onClick={handleGuardarNuevaPassword}
                disabled={isRecuperando}
                className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-xl shadow-indigo-500/20 rounded-xl"
              >
                {isRecuperando ? "Guardando..." : "Guardar Contraseña"}
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
        
        <Card className="w-full max-w-md border-slate-800 bg-slate-900/50 backdrop-blur-xl shadow-2xl overflow-hidden relative z-10">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50" />
          <CardHeader className="text-center pb-2 pt-10">
            <div className="mx-auto w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-indigo-500/20 transition-all hover:scale-105 hover:rotate-3 duration-500">
              <Store className="w-10 h-10 text-white" />
            </div>
            <CardTitle className="text-3xl font-black text-white tracking-tighter">
              Caja <span className="text-indigo-500">Mágica</span>
            </CardTitle>
            <p className="text-sm text-slate-400 mt-2 font-medium tracking-widest uppercase opacity-70">Sistema de Gestión Profesional</p>
          </CardHeader>
          <CardContent className="space-y-6 pt-8 px-10 pb-12">
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Correo Electrónico</Label>
                <div className="relative group">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4 group-focus-within:text-indigo-400 transition-colors" />
                  <Input 
                    id="email" 
                    type="email"
                    autoComplete="email"
                    placeholder="correo@ejemplo.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="pl-10 h-12 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-600 focus:border-indigo-500 focus:ring-indigo-500/20 rounded-xl transition-all"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Contraseña</Label>
                <div className="relative group">
                  <LogIn className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4 group-focus-within:text-indigo-400 transition-colors" />
                  <Input 
                    id="password" 
                    type="password" 
                    autoComplete="off"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                    className="pl-10 h-12 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-600 focus:border-indigo-500 focus:ring-indigo-500/20 rounded-xl transition-all"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={isRecuperando}
                    className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    {isRecuperando ? "Enviando correo..." : "¿Olvidaste tu contraseña?"}
                  </button>
                </div>
              </div>
            </div>
            <Button onClick={handleLogin} disabled={isAuthLoading} className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-lg shadow-xl shadow-indigo-500/20 transition-all active:scale-[0.98] rounded-xl">
              {isAuthLoading ? "Iniciando sesión..." : "Iniciar Sesión"}
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-700"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-slate-900 px-2 text-slate-500 font-bold">O CONTINÚA CON</span>
              </div>
            </div>
            <Button onClick={() => {
              toast({
                title: "Acceso con Google no disponible",
                description: "Este proyecto usa correo y contrasena. Google se habilita en Supabase > Authentication > Providers si lo necesitas.",
                variant: "destructive",
              });
            }} disabled={isAuthLoading} variant="outline" className="w-full h-12 border-slate-700 text-slate-400 hover:bg-slate-800 font-bold rounded-xl">
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google (no disponible)
            </Button>
            <div className="text-center pt-4">
              <p className="text-[10px] text-slate-600 font-bold tracking-widest uppercase">
                {EMPRESA.nombreComercial || 'Sistema de Ventas'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-slate-50/50 selection:bg-indigo-100">
      <div className="bg-slate-900 sticky top-0 z-40 border-b border-slate-800 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 transition-transform hover:scale-105 duration-300">
                <Store className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div>
                <h1 className="text-sm sm:text-xl font-bold text-white tracking-tight">Distribuidora MILAN</h1>
                {!isMobile && <p className="text-[10px] sm:text-xs text-slate-400 font-medium uppercase tracking-widest">SISTEMA PROFESIONAL</p>}
              </div>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4">
              {isOnline ? (
                <Badge variant="secondary" className="bg-green-900 text-green-400 border-green-700 hidden sm:flex font-bold px-3 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full mr-1.5 animate-pulse" />
                  ONLINE
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-red-900 text-red-400 border-red-700 hidden sm:flex font-bold px-3 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 bg-red-400 rounded-full mr-1.5" />
                  OFFLINE
                </Badge>
              )}
              <Badge variant="secondary" className="bg-slate-800 text-slate-100 border-slate-700 hidden sm:flex font-medium px-3 py-1 rounded-full max-w-[180px]">
                <span className="truncate">{users.find(u => u.email === getCurrentSupabaseUser()?.email)?.name || firebaseUser?.displayName || 'Usuario'}</span>
              </Badge>
              <Badge variant="secondary" className="bg-slate-800 text-indigo-400 border-slate-700 hidden sm:flex font-bold px-3 py-1 rounded-full">
                <User className="w-3 h-3 mr-1.5" />
                {userRole === 'admin' ? 'ADMINISTRADOR' : 'EMPLEADO'}
              </Badge>
              <Button
                variant="ghost"
                size={isMobile ? "icon" : "sm"}
                className="text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors rounded-full"
                onClick={() => setIsConfigOpen(true)}
              >
                <Settings className="w-5 h-5" />
              </Button>
              <Button 
                variant="ghost" 
                size={isMobile ? "icon" : "sm"} 
                className="text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors rounded-full"
                onClick={async () => {
                  await firebaseLogout().catch(() => {});
                  setIsAuthenticated(false);
                  setCurrentSale([]);
                  setSearchTerm("");
                  setInventorySearch("");
                  setPaymentMethod('efectivo');
                  setAmountPaid("");
                  setPassword("");
                  setLoginEmail("");
                  setFirebaseUser(null);
                  setNewProduct({ name: '', purchasePrice: 0, salePrice: 0, stock: 0, category: '' });
                  setNewWeightProduct({ name: "", purchasePrice: 0, salePrice: 0, purchasePricePerKg: 0, salePricePerKg: 0, equivalentGrams: 0, stock: 0, initialStock: 0, minWeightGrams: 0, category: "" });
      setNewUser({ password: '', name: '', role: 'empleado', email: '' });
                  setConfirmPassword('');
                  setShowPassword(false);
                  setShowConfirmPassword(false);
                  setEditingProduct(null);
                  setEditingWeightProduct(null);
                  setEditingUser(null);
                  setEditingQuickProduct(null);
                  setSelectedSaleDetail(null);
                  setSelectedCloseDetail(null);
                  setSelectedWeightProduct(null);
                  setWeightQuantities({});
                  setCustomWeight('');
                  setRestockQuantities({});
                  setAdminPassword('');
                  setCloseToDelete(null);
                  setIsAddProductOpen(false);
                  setIsEditProductOpen(false);
                  setIsEditWeightProductOpen(false);
                  setIsAddUserOpen(false);
                  setIsEditUserOpen(false);
                  setIsCloseCashOpen(false);
                  setIsDetailOpen(false);
                  setIsCloseDetailOpen(false);
                  setIsRestockModalOpen(false);
                  setIsWeightModalOpen(false);
                  setIsDeleteMode(false);
                  setIsDeleteConfirmOpen(false);
                  setIsDeleteCloseOpen(false);
                  setIsEditQuickProductOpen(false);
                  setIsProductosVendidosOpen(false);
                  setIsVentasIndividualesOpen(false);
                  setIsStockHistoryModalOpen(false);
                  setIsDeleteStockHistoryOpen(false);
                  setIsDeleteSaleOpen(false);
                  setIsMayoristaModalOpen(false);
                  setIsBoletaPreviewOpen(false);
                  setBoletaPreviewHTML('');
                  setIsConfigOpen(false);
                  setIsViewMayoristaProductOpen(false);
                  setIsStockCriticoOpen(false);
                  setIsClearSalesOpen(false);
                  setIsDeleteProductConfirmOpen(false);
                  setIsEditMayoristaOpen(false);
                  setSalesFilter('all');
                  setTransaccionesFilter('all');
                  setResumenTab('regular');
                  setSalesSearch('');
                  setSelectedProductsToDelete([]);
                  setProductsToDelete([]);
                }}>
                {isMobile ? <LogIn className="w-5 h-5 rotate-180" /> : "Cerrar Sesión"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {storageAlert === 'critical' && (
          <div className="mb-4 px-4 py-3 bg-red-100 border border-red-400 text-red-800 rounded-xl flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-semibold">Almacenamiento crítico. Conéctese a internet para liberar espacio.</p>
          </div>
        )}
        {storageAlert === 'warning' && (
          <div className="mb-4 px-4 py-3 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded-xl flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-semibold">Almacenamiento casi lleno. Conéctese a internet para sincronizar.</p>
          </div>
        )}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 sm:space-y-6">
          <TabsList className={`flex w-full overflow-x-auto sm:grid ${userRole === 'admin' ? 'sm:grid-cols-5' : 'sm:grid-cols-3'} h-auto p-1.5 bg-slate-200/50 rounded-xl shadow-inner`}>
            <TabsTrigger value="ventas" className="flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-md transition-all text-slate-600">
              <ShoppingCart className="w-4 h-4" />
              <span className={isMobile ? "text-xs" : ""}>Ventas</span>
            </TabsTrigger>
            <TabsTrigger value="inventario" className="flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-md transition-all text-slate-600">
              <Package className="w-4 h-4" />
              <span className={isMobile ? "text-xs" : ""}>{isMobile ? "Inv." : "Inventario"}</span>
            </TabsTrigger>
            <TabsTrigger value="ventas-dia" className="flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-md transition-all text-slate-600">
              <TrendingUp className="w-4 h-4" />
              <span className={isMobile ? "text-xs" : ""}>{isMobile ? "Hoy" : "Ventas del Día"}</span>
            </TabsTrigger>
            {userRole === 'admin' && (
              <TabsTrigger value="historial-diario" className="flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-md transition-all text-slate-600">
                <History className="w-4 h-4" />
                <span className={isMobile ? "text-xs" : ""}>{isMobile ? "Hist." : "Historial"}</span>
              </TabsTrigger>
            )}
            {userRole === 'admin' && (
              <TabsTrigger value="usuarios" className="flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-md transition-all text-slate-600">
                <UserPlus className="w-4 h-4" />
                <span className={isMobile ? "text-xs" : ""}>{isMobile ? "User" : "Usuarios"}</span>
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="ventas" className="space-y-4 sm:space-y-6">
            <div className="flex bg-slate-200/50 p-1 rounded-xl w-fit">
              <Button
                variant={ventaMode === 'regular' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => { setVentaMode('regular'); setIgvRateStr("18"); setSearchTerm(''); }}
                className={`flex-1 sm:flex-none text-[10px] font-bold uppercase tracking-wider rounded-lg px-4 ${
                  ventaMode === 'regular'
                    ? 'bg-slate-700 text-white hover:bg-slate-800 shadow-md'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
                Venta Regular
              </Button>
              <Button
                variant={ventaMode === 'mayor' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => { setVentaMode('mayor'); setIgvRateStr(""); setSearchTerm(''); }}
                className={`flex-1 sm:flex-none text-[10px] font-bold uppercase tracking-wider rounded-lg px-4 ${
                  ventaMode === 'mayor'
                    ? 'bg-slate-700 text-white hover:bg-slate-800 shadow-md'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Package className="w-3.5 h-3.5 mr-1.5" />
                Venta por Mayor
              </Button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              <div className="lg:col-span-2 space-y-4">
                <Card>
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <span>{ventaMode === 'mayor' ? 'Productos Mayoristas' : 'Productos'}</span>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                        <div className="relative w-full sm:w-64">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <Input
                            placeholder="Buscar productos..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 h-9 border-slate-200 focus:border-indigo-500 focus:ring-indigo-500" />
                        </div>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[500px] sm:h-[600px] pr-4">
                      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-4 justify-items-center">
                        {filteredProducts.map((product) => (
                          <Card
                            key={product.id}
                            className="group overflow-hidden transition-all duration-300 border-slate-100 cursor-pointer hover:shadow-xl hover:border-indigo-200 hover:-translate-y-1 bg-white w-full"
                            onClick={() => agregarProductoVenta(product)}
                          >
                            <CardContent className="p-0">
                              <div className="p-3 sm:p-4 space-y-2">
                                {product.imageUrl && (
                                  <div className="flex justify-center w-full h-32 sm:h-40 mb-2 overflow-hidden">
                                    <img src={product.imageUrl} alt={product.name} className="h-full object-cover rounded-lg" />
                                  </div>
                                )}
                                <div className="flex justify-between items-start gap-2">
                                  <h3 className="font-bold text-xs sm:text-sm text-slate-800 line-clamp-2 leading-tight h-8 sm:h-10 group-hover:text-indigo-600 transition-colors">
                                    {product.name}
                                  </h3>
                                </div>
                                
                                <div className="flex items-center justify-between gap-1">
                                  <Badge variant="outline" className="text-[9px] sm:text-[10px] font-medium px-1.5 py-0 border-slate-200 text-slate-500 bg-slate-50 truncate max-w-[60px] sm:max-w-none">
                                    {product.category}
                                  </Badge>
                                  <Badge 
                                    variant={(() => { const rs = product.type === 'mayorista' ? (product.saleLevels || []).reduce((s, l) => s + (l.stock || 0), 0) : product.stock; return rs > 0 ? "secondary" : "destructive"; })()}
                                    className={`text-[9px] sm:text-[10px] px-1.5 py-0 font-bold ${(() => { const threshold = product.type === 'peso' ? 500 : 20; const rs = product.type === 'mayorista' ? (product.saleLevels || []).reduce((s, l) => s + (l.stock || 0), 0) : product.stock; return rs > 0 && rs <= threshold ? 'bg-amber-100 text-amber-700 border-amber-200' : rs > threshold ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : ''; })()}`}
                                  >
                                    {(() => { if (product.type === 'peso') return (product.stock / 1000).toFixed(1) + 'kg'; const total = product.type === 'mayorista' ? (product.saleLevels || []).reduce((s, l) => s + (l.stock || 0), 0) : product.stock; return 'Stock: ' + total; })()}
                                  </Badge>
                                </div>

                                <div className="pt-1 flex items-center justify-between border-t border-slate-50 mt-2">
                                  <span className="text-sm sm:text-lg font-black text-indigo-600">
                    S/ {(product.salePrice || 0).toFixed(2)}{product.type === 'peso' ? <span className="text-[10px] text-slate-400 font-normal ml-0.5">/{product.stock >= 1000 ? 'kg' : 'g'}</span> : ''}
                  </span>
                                  <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white group-hover:shadow-lg group-hover:shadow-indigo-200 transition-all duration-300">
                                    <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              <div className="lg:col-span-1">
                <Card className="sticky top-4">
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="flex items-center space-x-2">
                      <ShoppingCart className="w-5 h-5 text-blue-600" />
                      <span>Venta Actual</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6 space-y-4">
                    <ScrollArea className={`${currentSale.length === 0 ? 'h-24' : 'h-[300px] sm:h-[400px]'}`}>
                      {currentSale.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 py-4">
                          <ShoppingCart className="w-8 h-8 mb-2 opacity-20" />
                          <p className="text-sm">Carrito vacío</p>
                        </div>
                      ) : (
                        <div className="space-y-3 pr-4">
                          {currentSale.map((item) => (
                            <div key={`${item.product.id}-${item.selectedLevelName || 'default'}`} className="group relative flex flex-col p-3 bg-gray-50 rounded-lg border border-transparent hover:border-blue-200 transition-colors">
                              <div className="flex justify-between items-start mb-2">
                                <div className="flex-1 flex items-start gap-2">
                                  {item.product.imageUrl ? (
                                    <img src={item.product.imageUrl} alt={item.product.name} className="w-10 h-10 object-cover rounded-md flex-shrink-0 mt-0.5" />
                                  ) : (
                                    <div className="w-10 h-10 rounded-md bg-slate-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                                      <Package className="w-4 h-4 text-slate-400" />
                                    </div>
                                  )}
                                  <div>
                                    <p className="font-semibold text-sm text-gray-900 leading-tight">
                                      {item.product.name}
                                      {item.selectedLevelName && (
                                        <span className="font-normal text-gray-500"> — {item.selectedLevelName}</span>
                                      )}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                      {item.product.type === 'peso'
                                        ? `S/ ${((item.product.salePricePerKg || 0) / 1000).toFixed(3)}/g`
                                        : item.selectedLevelName
                                          ? (() => {
                                              const lvl = item.product.saleLevels?.find(l => l.name === item.selectedLevelName);
                                              return `S/ ${(item.product.salePrice || 0).toFixed(2)} c/${item.selectedLevelName}${lvl ? ` (${lvl.baseUnitsContained} u)` : ''}`;
                                            })()
                                          : `S/ ${(item.product.salePrice || 0).toFixed(2)} c/u`}
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => eliminarProductoVenta(item.product.id, item.selectedLevelName)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                              
                              <div className="flex items-center justify-between mt-1">
                                <div className="flex items-center bg-white border rounded-md p-0.5">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() => actualizarCantidad(item.product.id, item.quantity - (item.product.type === 'peso' ? 100 : 1))}
                                  >
                                    <Minus className="w-3 h-3" />
                                  </Button>
                                  <span className="min-w-[40px] text-center text-xs font-bold">
                                    {item.product.type === 'peso' ? formatWeight(item.quantity) : item.selectedLevelName ? `${item.quantity} ${item.selectedLevelName}(s)` : item.quantity}
                                  </span>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() => actualizarCantidad(item.product.id, item.quantity + (item.product.type === 'peso' ? 100 : 1))}
                                  >
                                    <Plus className="w-3 h-3" />
                                  </Button>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-bold text-blue-600">
                                    S/ {item.product.type === 'peso'
                                      ? ((item.product.salePricePerKg || 0) * (item.quantity / 1000)).toFixed(2)
                                      : ((item.product.salePrice || 0) * item.quantity).toFixed(2)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>

                    <Separator />

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-sm">
                          <span>Subtotal:</span>
                          <span>S/ {calcularSubtotal().toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span>IGV ({parseFloat(igvRateStr) || 18}%):</span>
                          <span>S/ {calcularIGV(calcularSubtotal()).toFixed(2)}</span>
                        </div>

                        {paymentMethod === 'efectivo' && (
                        <div className="flex items-center justify-between">
                          <label className="text-sm flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={aplicarRedondeo}
                              onChange={(e) => setAplicarRedondeo(e.target.checked)}
                              className="rounded border-gray-300 w-4 h-4 accent-indigo-600"
                            />
                            Aplicar redondeo
                          </label>
                        </div>
                        )}
                        <Separator />
                        <div className="flex justify-between items-center">
                          <span className="text-lg font-semibold">Total:</span>
                          <span className="text-2xl font-bold text-green-600">
                            S/ {(paymentMethod === 'efectivo' && aplicarRedondeo ? redondearTotalEfectivo(calcularTotal()) : calcularTotal()).toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Método de Pago</Label>
                        <Select value={paymentMethod} onValueChange={(value: 'efectivo' | 'tarjeta' | 'yape' | 'plin') => setPaymentMethod(value)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="efectivo">
                              <div className="flex items-center space-x-2">
                                <Banknote className="w-4 h-4 text-green-600" />
                                <span>Efectivo</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="tarjeta">
                              <div className="flex items-center space-x-2">
                                <CreditCard className="w-4 h-4 text-orange-600" />
                                <span>Tarjeta</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="yape">
                              <div className="flex items-center space-x-2">
                                <Smartphone className="w-4 h-4 text-purple-600" />
                                <span>Yape</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="plin">
                              <div className="flex items-center space-x-2">
                                <CreditCard className="w-4 h-4 text-cyan-600" />
                                <span>Plin</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>



                      {paymentMethod === 'efectivo' && (
                        <div className="space-y-2">
                          <Label>Monto Recibido</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={amountPaid}
                            onChange={(e) => setAmountPaid(e.target.value)}
                            placeholder="0.00" />
                          {parseFloat(amountPaid) > 0 && (
                            <div className="flex justify-between text-lg font-bold text-yellow-600 bg-yellow-50 p-3 rounded-lg">
                              <span>Cambio:</span>
                              <span>S/ {calcularCambio().toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      )}

                      <Button
                        onClick={confirmarVenta}
                        className="w-full h-14 success-gradient text-white text-lg font-black uppercase tracking-widest shadow-xl shadow-emerald-900/20 active:scale-[0.98] transition-all rounded-xl border-t border-emerald-400/20"
                        disabled={currentSale.length === 0 || (paymentMethod === 'efectivo' && (amountPaid.trim() === '' || parseFloat(amountPaid) < (aplicarRedondeo ? redondearTotalEfectivo(calcularTotal()) : calcularTotal())))}
                      >
                        <Calculator className="w-6 h-6 mr-3" />
                        Confirmar Venta
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="inventario" className="space-y-4 sm:space-y-6">
            <div className="flex bg-slate-200/50 p-1 rounded-xl w-fit">
              <Button
                variant={inventorySubTab === 'general' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setInventorySubTab('general')}
                className={`flex-1 sm:flex-none text-[10px] font-bold uppercase tracking-wider rounded-lg px-4 ${
                  inventorySubTab === 'general'
                    ? 'bg-slate-700 text-white hover:bg-slate-800 shadow-md'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Package className="w-3.5 h-3.5 mr-1.5" />
                Inventario General
              </Button>
              <Button
                variant={inventorySubTab === 'mayorista' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setInventorySubTab('mayorista')}
                className={`flex-1 sm:flex-none text-[10px] font-bold uppercase tracking-wider rounded-lg px-4 ${
                  inventorySubTab === 'mayorista'
                    ? 'bg-slate-700 text-white hover:bg-slate-800 shadow-md'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Store className="w-3.5 h-3.5 mr-1.5" />
                Inventario Mayorista
              </Button>
            </div>

            {inventorySubTab === 'general' && (
            <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
              {userRole === 'admin' && (
              <Card className="bg-white border-slate-100 shadow-sm overflow-hidden group">
                <div className="h-1 w-full bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardContent className="p-3 sm:p-4">
                  <div className="text-center">
                    <Package className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 sm:mb-2 text-indigo-600" />
                    <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-widest">Valor Compra</p>
                    <p className="text-lg sm:text-2xl font-black text-slate-900">S/ {inventoryTotals.totalPurchaseValue.toFixed(2)}</p>
                  </div>
                </CardContent>
              </Card>
              )}
              {userRole === 'admin' && (
              <Card className="bg-white border-slate-100 shadow-sm overflow-hidden group">
                <div className="h-1 w-full bg-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardContent className="p-3 sm:p-4">
                  <div className="text-center">
                    <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 sm:mb-2 text-emerald-600" />
                    <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-widest">Valor Venta</p>
                    <p className="text-lg sm:text-2xl font-black text-slate-900">S/ {inventoryTotals.totalSaleValue.toFixed(2)}</p>
                  </div>
                </CardContent>
              </Card>
              )}
              {userRole === 'admin' && (
              <Card className="bg-white border-slate-100 shadow-sm overflow-hidden group">
                <div className="h-1 w-full bg-violet-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardContent className="p-3 sm:p-4">
                  <div className="text-center">
                    <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 sm:mb-2 text-violet-600" />
                    <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-widest">Ganancia Est.</p>
                    <p className="text-lg sm:text-2xl font-black text-slate-900">S/ {inventoryTotals.potentialProfit.toFixed(2)}</p>
                  </div>
                </CardContent>
              </Card>
              )}
              <Card className="bg-white border-slate-100 shadow-sm overflow-hidden group">
                <div className="h-1 w-full bg-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardContent className="p-3 sm:p-4">
                  <Dialog open={isRestockModalOpen} onOpenChange={setIsRestockModalOpen}>
                    <DialogTrigger asChild>
                      <div className="text-center cursor-pointer">
                        <AlertTriangle className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 sm:mb-2 text-amber-600" />
                        <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-widest">Stock Bajo</p>
                        <p className="text-lg sm:text-2xl font-black text-slate-900">{inventoryStats.lowStock}</p>
                      </div>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh]">
                      <DialogHeader>
                        <DialogTitle>
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-amber-600" />
                            Stock Bajo
                          </div>
                        </DialogTitle>
                        <DialogDescription>
                          Productos con stock por debajo del umbral (20 unidades / 500g para peso).
                        </DialogDescription>
                      </DialogHeader>
                      <ScrollArea className="max-h-[60vh]">
                        {lowStockProducts.length === 0 ? (
                          <div className="py-8 text-center text-slate-500">
                            No hay productos con stock bajo.
                          </div>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Producto</TableHead>
                                <TableHead>Categoría</TableHead>
                                <TableHead className="text-right">Stock</TableHead>
                                <TableHead className="text-right">Estado</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {lowStockProducts.map(product => (
                                <TableRow key={product.id}>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      {product.imageUrl ? (
                                        <img src={product.imageUrl} alt={product.name} className="w-8 h-8 object-cover rounded" />
                                      ) : (
                                        <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center">
                                          <Package className="w-4 h-4 text-slate-400" />
                                        </div>
                                      )}
                                      <span className="font-medium">{product.name}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="text-[10px] font-normal">{product.category}</Badge>
                                  </TableCell>
                                  <TableCell className="text-right font-mono">
                                    {product.type === 'peso' ? formatWeight(product.stock) : `${product.stock}`}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {(() => { const rs = product.type === 'mayorista' ? (product.saleLevels || []).reduce((s, l) => s + (l.stock || 0), 0) : product.stock; return rs === 0 ? (
                                      <Badge variant="destructive">AGOTADO</Badge>
                                    ) : (
                                      <Badge variant="secondary" className="bg-amber-100 text-amber-800">BAJO</Badge>
                                    ); })()}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
              <Card className="bg-white border-slate-100 shadow-sm overflow-hidden group col-span-2 sm:col-span-1">
                <div className="h-1 w-full bg-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardContent className="p-3 sm:p-4">
                  <div className="text-center">
                    <Store className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 sm:mb-2 text-slate-600" />
                    <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-widest">Total Prods</p>
                    <p className="text-lg sm:text-2xl font-black text-slate-900">{inventoryStats.totalProducts}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
            <Card className="border-slate-100 shadow-xl overflow-hidden">
              <CardHeader className="p-4 sm:p-6 bg-slate-50 border-b border-slate-100">
                <CardTitle className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                  <span className="text-slate-900 font-black tracking-tight">Gestión de Inventario</span>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full lg:w-auto">
                    <div className="flex bg-slate-200/50 p-1 rounded-xl">
                      <Button
                        variant={inventoryView === 'unidad' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setInventoryView('unidad')}
                        className="flex-1 sm:flex-none text-[10px] font-bold uppercase tracking-wider rounded-lg"
                      >
                        Unidad
                      </Button>
                      <Button
                        variant={inventoryView === 'peso' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setInventoryView('peso')}
                        className="flex-1 sm:flex-none text-[10px] font-bold uppercase tracking-wider rounded-lg"
                      >
                        Peso
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      {userRole === 'admin' && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => {
                            setNewProductType('general');
                            setAddProductMode('unidad');
                            setIsAddProductOpen(true);
                          }}
                          className="flex-1 sm:flex-none flex items-center justify-center space-x-2 h-10 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 rounded-xl"
                        >
                          <Plus className="w-4 h-4" />
                          <span className="font-bold uppercase tracking-wider text-[10px]">Nuevo</span>
                        </Button>
                      )}
                      <div className="relative flex-1 sm:w-64">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <Input
                          placeholder="Buscar en inventario..."
                          value={inventorySearch}
                          onChange={(e) => setInventorySearch(e.target.value)}
                          autoComplete="off"
                          disabled={isDeleteProductConfirmOpen}
                          className="pl-10 h-10 border-slate-200 focus:border-indigo-500 rounded-xl" />
                      </div>
                    </div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 sm:pt-0">
                <div className="border-t sm:border rounded-lg">
                  <div className="overflow-auto h-[500px]">
                    <Table>
                      <TableHeader className="sticky top-0 bg-white z-10">
                        <TableRow className="bg-gray-50/50">
                          <TableHead className="w-[200px] border-r">Producto</TableHead>
                          <TableHead className="border-r">Categoría</TableHead>
                          {userRole === 'admin' && <TableHead className="border-r bg-blue-50">{purchaseHeader}</TableHead>}
                          <TableHead className="border-r bg-green-50">{saleHeader}</TableHead>

                          <TableHead className="border-r">Estado</TableHead>
                          {userRole === 'admin' && (
                            <TableHead className="border-r">Ganancia</TableHead>
                          )}
                          <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredInventory.map((product) => {
                          const isUnidadMay = product.type === 'unidad' && product.saleLevels && product.saleLevels.length > 0;
                          return (
                          <TableRow key={product.id} className="hover:bg-gray-50/50">
                            <TableCell className="font-semibold border-r">
                              <div className="flex items-center gap-2">
                                {product.imageUrl ? (
                                  <img src={product.imageUrl} alt={product.name} className="w-12 h-12 object-cover rounded-lg border flex-shrink-0" />
                                ) : (
                                  <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                                    <Package className="w-5 h-5 text-slate-400" />
                                  </div>
                                )}
                                <div className="flex flex-col min-w-0">
                                  <span className="text-sm truncate">{product.name}</span>
                                  <span className="text-[10px] text-gray-400 uppercase">{product.type}</span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="border-r">
                              <Badge variant="outline" className="text-[10px] font-normal">{product.category}</Badge>
                            </TableCell>
                            {userRole === 'admin' && (
                              <TableCell className="border-r text-xs font-medium text-blue-600 bg-blue-50">
                                S/ {product.type === 'peso' ? (product.purchasePrice ?? product.purchasePricePerKg ?? 0).toFixed(2) : (product.purchasePrice || 0).toFixed(2)}
                                {product.type === 'peso' && <span className="text-[10px] text-gray-400 ml-0.5">/kg</span>}
                              </TableCell>
                            )}
                            <TableCell className="border-r text-xs font-bold text-green-600 bg-green-50">
                              S/ {product.type === 'peso' ? (product.salePrice ?? product.salePricePerKg ?? 0).toFixed(2) : (product.salePrice || 0).toFixed(2)}
                              {product.type === 'peso' && <span className="text-[10px] text-gray-400 ml-0.5">/kg</span>}
                            </TableCell>

                            <TableCell className="border-r">
                              <Badge
                                variant="secondary"
                                className={`text-[10px] ${(() => { const threshold = product.type === 'peso' ? 500 : 20; const rs = product.type === 'mayorista' ? (product.saleLevels || []).reduce((s, l) => s + (l.stock || 0), 0) : product.stock; return rs === 0 ? 'bg-red-100 text-red-700' : rs <= threshold ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'; })()}`}>
                                {(() => { const threshold = product.type === 'peso' ? 500 : 20; const rs = product.type === 'mayorista' ? (product.saleLevels || []).reduce((s, l) => s + (l.stock || 0), 0) : product.stock; return rs === 0 ? 'Agotado' : rs <= threshold ? 'Bajo' : 'OK'; })()}
                              </Badge>
                            </TableCell>
                            {userRole === 'admin' && (
                              <TableCell className="border-r text-xs font-bold text-purple-600">
                                S/ {calculateProductPotentialProfit(product).toFixed(2)}
                              </TableCell>
                            )}
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {!isUnidadMay && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-blue-600"
                                  onClick={() => verProductoMayorista(product)}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                )}
                                {userRole === 'admin' && !isUnidadMay && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-purple-600"
                                  onClick={() => {
                                    setSelectedStockHistoryProduct(product);
                                    if (product.type === 'mayorista' && product.saleLevels && product.saleLevels.length > 0) {
                                      const sortedLevels = [...product.saleLevels].sort((a, b) => { if (a.name === 'Unidad') return -1; if (b.name === 'Unidad') return 1; return a.baseUnitsContained - b.baseUnitsContained; });
                                      setSelectedHistoryLevel(sortedLevels[0].name);
                                    } else {
                                      setSelectedHistoryLevel('');
                                    }
                                    setIsStockHistoryModalOpen(true);
                                  }}
                                >
                                  <History className="w-4 h-4" />
                                </Button>
                                )}
                                {userRole === 'admin' && !isUnidadMay && (
                                  <>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600" onClick={() => editarProducto(product)}>
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => {
                                      setProductToDelete(product);
                                      setIsDeleteProductConfirmOpen(true);
                                    }}>
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
            </>
            )}

          {inventorySubTab === 'mayorista' && (
            <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
              <Card className="bg-white border-slate-100 shadow-sm overflow-hidden group">
                <div className="h-1 w-full bg-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardContent className="p-3 sm:p-4">
                  <div className="text-center">
                    <ShoppingCart className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 sm:mb-2 text-purple-600" />
                    <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-widest">Más Vendido</p>
                    <p className="text-base sm:text-xl font-black text-slate-900 break-words leading-tight">
                      {mayoristaStats.topSoldProduct?.name || 'Sin ventas'}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card
                className="bg-white border-slate-100 shadow-sm overflow-hidden group cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => {
                  setStockCriticoLevels(stockCriticoList);
                  setIsStockCriticoOpen(true);
                }}
              >
                <div className="h-1 w-full bg-rose-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardContent className="p-3 sm:p-4">
                  <div className="text-center">
                    <AlertTriangle className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 sm:mb-2 text-rose-600" />
                    <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-widest">Stock Crítico</p>
                    <p className="text-lg sm:text-2xl font-black text-slate-900">{mayoristaStats.stockCriticoCount}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-white border-slate-100 shadow-sm overflow-hidden group">
                <div className="h-1 w-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardContent className="p-3 sm:p-4">
                  <div className="text-center">
                    <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 sm:mb-2 text-blue-600" />
                    <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-widest">Valor del Inventario</p>
                    <p className="text-lg sm:text-2xl font-black text-slate-900">
                      S/ {mayoristaStats.inventarioValor.toFixed(2)}
                    </p>
                  </div>
                </CardContent>
              </Card>
              {userRole === 'admin' && (
              <Card className="bg-white border-slate-100 shadow-sm overflow-hidden group">
                <div className="h-1 w-full bg-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardContent className="p-3 sm:p-4">
                  <div className="text-center">
                    <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 sm:mb-2 text-emerald-600" />
                    <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-widest">Ganancia Est.</p>
                    <p className="text-lg sm:text-2xl font-black text-slate-900">S/ {mayoristaStats.potentialProfit.toFixed(2)}</p>
                  </div>
                </CardContent>
              </Card>
              )}
              <Card className="bg-white border-slate-100 shadow-sm overflow-hidden group col-span-2 sm:col-span-1">
                <div className="h-1 w-full bg-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardContent className="p-3 sm:p-4">
                  <div className="text-center">
                    <Store className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 sm:mb-2 text-slate-600" />
                    <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-widest">Total Prods</p>
                    <p className="text-lg sm:text-2xl font-black text-slate-900">{mayoristaStats.totalProducts}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-slate-100 shadow-xl overflow-hidden">
              <CardHeader className="p-4 sm:p-6 bg-slate-50 border-b border-slate-100">
                <CardTitle className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                  <span className="text-slate-900 font-black tracking-tight">Productos Mayoristas</span>
                  <div className="flex gap-2">
                    <div className="relative flex-1 sm:w-56">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <Input
                        placeholder="Buscar mayorista..."
                        value={mayoristaSearch}
                        onChange={(e) => setMayoristaSearch(e.target.value)}
                        disabled={isDeleteProductConfirmOpen}
                        className="pl-10 h-10 border-slate-200 focus:border-indigo-500 rounded-xl" />
                    </div>
                    {userRole === 'admin' && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          setNewProductType('mayorista');
                          setAddProductMode('mayorista');
                          limpiarFormularioMayorista();
                          setIsAddProductOpen(true);
                        }}
                        className="flex items-center justify-center space-x-2 h-10 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 rounded-xl"
                      >
                        <Plus className="w-4 h-4" />
                        <span className="font-bold uppercase tracking-wider text-[10px]">Nuevo</span>
                      </Button>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 sm:pt-0">
                <div className="border-t sm:border rounded-lg">
                  <div className="overflow-auto h-[500px]">
                    <Table>
                      <TableHeader className="sticky top-0 bg-white z-10">
                        <TableRow className="bg-gray-50/50">
                          <TableHead className="w-[200px] border-r">Producto</TableHead>
                          <TableHead className="border-r">Categoría</TableHead>
                          <TableHead className="border-r">Niveles Venta</TableHead>
                          <TableHead className="border-r text-center">Estado</TableHead>
                          <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredMayoristaProducts.map((product) => {
                          const sortedLevels = [...(product.saleLevels || [])].sort((a, b) => { if (a.name === 'Unidad') return -1; if (b.name === 'Unidad') return 1; return a.baseUnitsContained - b.baseUnitsContained; });
                          const minLevel = sortedLevels[0];
                          
                          return (
                          <TableRow key={product.id} className="hover:bg-gray-50/50">
                            <TableCell className="font-semibold border-r">
                              <div className="flex items-center gap-2">
                                {product.imageUrl ? (
                                  <img src={product.imageUrl} alt={product.name} className="w-12 h-12 object-cover rounded-lg border flex-shrink-0" />
                                ) : (
                                  <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                                    <Package className="w-5 h-5 text-slate-400" />
                                  </div>
                                )}
                                <span className="text-sm">{product.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="border-r">
                              <Badge variant="outline" className="text-[10px] font-normal">{product.category}</Badge>
                            </TableCell>
                            <TableCell className="border-r">
                              <div className="flex flex-wrap gap-1">
                                {product.saleLevels?.map((level, i) => {
                                  const isUnidadBased = product.saleLevels?.some(l => l.name === 'Unidad');
                                  const levelStock = isUnidadBased && level.name !== 'Unidad'
                                    ? Math.floor(product.stock / level.baseUnitsContained)
                                    : level.stock;
                                  return (
                                  <TooltipProvider key={i}>
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <Badge variant="secondary" className={`text-[10px] ${level.name === 'Unidad' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-pink-50 text-pink-700 border-pink-200'}`}>
                                          {level.name}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="text-xs">{level.name === 'Unidad' ? '1 unid.' : `Contiene: ${level.baseUnitsContained} unid.`}</p>
                                        <p className="text-xs">Compra: S/ {(level.purchasePrice ?? 0).toFixed(2)}</p>
                                        <p className="text-xs">Venta: S/ {(level.salePrice ?? 0).toFixed(2)}</p>
                                        {level.name === 'Unidad' ? (
                                          <p className="text-xs font-semibold">Stock: {product.stock} unid.</p>
                                        ) : (
                                          <p className="text-xs">Stock: {levelStock} {level.name}(s)</p>
                                        )}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  );
                                })}
                              </div>
                            </TableCell>
                            <TableCell className="border-r text-center">
                              <Badge
                                variant="secondary"
                                className={`text-[10px] ${(() => { const rs = product.type === 'mayorista' ? (product.saleLevels || []).reduce((s, l) => s + (l.stock || 0), 0) : product.stock; return rs === 0 ? 'bg-red-100 text-red-700' : rs <= 20 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'; })()}`}>
                                {(() => { const rs = product.type === 'mayorista' ? (product.saleLevels || []).reduce((s, l) => s + (l.stock || 0), 0) : product.stock; return rs === 0 ? 'Agotado' : rs <= 20 ? 'Bajo' : 'OK'; })()}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600" onClick={() => verProductoMayorista(product)}>
                                  <Eye className="w-4 h-4" />
                                </Button>
                                {userRole === 'admin' && (
                                  <>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-purple-600" onClick={() => {
                                      setSelectedStockHistoryProduct(product);
                                      if (product.type === 'mayorista' && product.saleLevels && product.saleLevels.length > 0) {
                                        const sortedLevels = [...product.saleLevels].sort((a, b) => { if (a.name === 'Unidad') return -1; if (b.name === 'Unidad') return 1; return a.baseUnitsContained - b.baseUnitsContained; });
                                        setSelectedHistoryLevel(sortedLevels[0].name);
                                      } else {
                                        setSelectedHistoryLevel('');
                                      }
                                      setIsStockHistoryModalOpen(true);
                                    }}>
                                      <History className="w-4 h-4" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600" onClick={() => editarProductoMayorista(product)}>
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => {
                                      setProductToDelete(product);
                                      setIsDeleteProductConfirmOpen(true);
                                    }}>
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
            </>
            )}
          </TabsContent>

          <TabsContent value="ventas-dia" className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
              <Card className="bg-white border-slate-100 shadow-sm overflow-hidden group">
                <div className="h-1 w-full bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardContent className="p-3 sm:p-4">
                  <div className="text-center">
                    <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 sm:mb-2 text-indigo-600" />
                    <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-widest">Ventas Hoy</p>
                    <p className="text-lg sm:text-2xl font-black text-slate-900">{todaysSales.length}</p>
                  </div>
                </CardContent>
              </Card>
              {userRole === 'admin' && (
              <Card className="bg-white border-slate-100 shadow-sm overflow-hidden group">
                <div className="h-1 w-full bg-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardContent className="p-3 sm:p-4">
                  <div className="text-center">
                    <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 sm:mb-2 text-emerald-600" />
                    <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-widest">Total Hoy</p>
                    <p className="text-lg sm:text-2xl font-black text-slate-900">
                      S/ {todaysSales.reduce((sum, sale) => sum + sale.total, 0).toFixed(2)}
                    </p>
                  </div>
                </CardContent>
              </Card>
              )}
              {userRole === 'admin' && (
                <Card className="bg-white border-slate-100 shadow-sm overflow-hidden group">
                  <div className="h-1 w-full bg-violet-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardContent className="p-3 sm:p-4">
                    <div className="text-center">
                      <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 sm:mb-2 text-violet-600" />
                      <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-widest">Ganancia Hoy</p>
                      <p className="text-lg sm:text-2xl font-black text-slate-900">
                        S/ {todaysSales.reduce((sum, sale) => sum + sale.totalProfit, 0).toFixed(2)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card className="bg-white border-slate-100 shadow-sm overflow-hidden group col-span-2 lg:col-span-1">
                <div className="h-1 w-full bg-orange-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardContent className="p-3 sm:p-4">
                  <div className="text-center">
                    <Package className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 sm:mb-2 text-orange-600" />
                    <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-widest">Prods Vendidos</p>
                    <p className="text-lg sm:text-2xl font-black text-slate-900">
                      {todaysSales.reduce((total, sale) => total + sale.items.reduce((itemSum, item) => {
                        return item.product.type === 'peso' ? itemSum + 1 : itemSum + item.quantity;
                      }, 0), 0)}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-white border-slate-100 shadow-sm overflow-hidden group">
                <div className="h-1 w-full bg-sky-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardContent className="p-3 sm:p-4">
                  <div className="text-center">
                    <ShoppingCart className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 sm:mb-2 text-sky-600" />
                    <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-widest">Total de Ventas</p>
                    <p className="text-lg sm:text-2xl font-black text-slate-900">{todaysSales.length}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <span className="text-xl font-black text-slate-900 tracking-tight">Ventas de Hoy</span>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                    <div className="flex bg-slate-200/50 p-1 rounded-xl">
                      <Button
                        variant={salesFilter === 'all' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setSalesFilter('all')}
                        className={`h-8 rounded-lg text-[10px] font-bold uppercase tracking-widest ${salesFilter === 'all' ? 'bg-slate-700 text-white hover:bg-slate-800 shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
                      >
                        Todas
                      </Button>
                      <Button
                        variant={salesFilter === 'regular' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setSalesFilter('regular')}
                        className={`h-8 rounded-lg text-[10px] font-bold uppercase tracking-widest ${salesFilter === 'regular' ? 'bg-slate-700 text-white hover:bg-slate-800 shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
                      >
                        Regulares
                      </Button>
                      <Button
                        variant={salesFilter === 'mayorista' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setSalesFilter('mayorista')}
                        className={`h-8 rounded-lg text-[10px] font-bold uppercase tracking-widest ${salesFilter === 'mayorista' ? 'bg-slate-700 text-white hover:bg-slate-800 shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
                      >
                        Mayoristas
                      </Button>
                    </div>
                    <div className="relative flex-1 sm:w-64">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <Input
                        placeholder="Buscar por ID Venta..."
                        value={salesSearch}
                        onChange={(e) => setSalesSearch(e.target.value)}
                        className="pl-10 h-10 border-slate-200 focus:border-indigo-500 rounded-xl" />
                    </div>
                      <Button
                        onClick={() => setIsCloseCashOpen(true)}
                        className="bg-slate-900 hover:bg-slate-800 text-white h-10 rounded-xl shadow-lg shadow-slate-200"
                        disabled={todaysSales.length === 0}
                      >
                        <DollarSign className="w-4 h-4 mr-2" />
                        <span className="font-bold uppercase tracking-widest text-[10px]">Cerrar Caja</span>
                      </Button>
                      <Button
                        onClick={() => setIsClearSalesOpen(true)}
                        className="bg-red-600 hover:bg-red-700 text-white h-10 rounded-xl shadow-lg shadow-slate-200"
                        disabled={todaysSales.length === 0}
                      >
                          <Trash2 className="w-4 h-4 mr-2" />
                          <span className="font-bold uppercase tracking-widest text-[10px]">Limpiar</span>
                        </Button>
                      {products.some(p => p.imageUrl?.startsWith('data:')) && (
                        <Button
                          onClick={handleMigrateImages}
                          disabled={isMigrating}
                          className="bg-sky-600 hover:bg-sky-700 text-white h-10 rounded-xl shadow-lg shadow-sky-200"
                        >
                          <CloudUpload className="w-4 h-4 mr-2" />
                          <span className="font-bold uppercase tracking-widest text-[10px]">{isMigrating ? 'Migrando...' : 'Migrar imágenes'}</span>
                        </Button>
                      )}
                    </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 sm:pt-0">
                <div className="border-t sm:border rounded-lg overflow-hidden">
                  <div className="overflow-auto h-[500px]">
                    <Table>
                      <TableHeader className="sticky top-0 bg-white z-10">
                        <TableRow className="bg-gray-50/50">
                          <TableHead className="border-r">Hora</TableHead>
                          <TableHead className="border-r">ID Venta</TableHead>
                          <TableHead className="border-r">Pago</TableHead>
                          <TableHead className="border-r">Tipo</TableHead>
                          <TableHead className="border-r text-right">Total</TableHead>
                          {userRole === 'admin' && <TableHead className="border-r text-right">Ganancia</TableHead>}
                          <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTodaysSales.slice().reverse().map((sale) => (
                          <TableRow key={sale.id} className="hover:bg-gray-50/50">
                            <TableCell className="border-r text-xs font-medium">
                              {new Date(sale.date).toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit', hour12: true })}
                            </TableCell>
                            <TableCell className="border-r font-mono text-xs">
                              {sale.id}
                            </TableCell>
                            <TableCell className="border-r">
                              <Badge variant="outline" className={`text-[10px] font-normal capitalize ${getPaymentMethodColor(sale.paymentMethod)}`}>
                                {sale.paymentMethod}
                              </Badge>
                            </TableCell>
                            <TableCell className="border-r">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {sale.items.some(item => item.selectedLevelName === 'Unidad') && (
                                  <Badge className="text-[9px] bg-blue-100 text-blue-700 border-blue-200">
                                    Unidad
                                  </Badge>
                                )}
                                {sale.items.some(item => item.product.type === 'mayorista' || (item.selectedLevelName && item.selectedLevelName !== 'Unidad')) && (
                                  <Badge className="text-[9px] bg-pink-100 text-pink-700 border-pink-200">
                                    Mayorista
                                  </Badge>
                                )}
                                {sale.items.some(item => item.product.type === 'unidad' && !item.selectedLevelName) && (
                                  <Badge className="text-[9px] bg-teal-100 text-teal-700 border-teal-200">
                                    Unidad Simple
                                  </Badge>
                                )}
                                {sale.items.some(item => item.product.type === 'peso') && (
                                  <Badge className="text-[9px] bg-amber-100 text-amber-700 border-amber-200">
                                    Peso
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="border-r text-right text-xs font-bold text-green-600">
                              S/ {sale.total.toFixed(2)}
                            </TableCell>
                            {userRole === 'admin' && (
                              <TableCell className="border-r text-right text-xs font-bold text-purple-600">
                                S/ {sale.totalProfit.toFixed(2)}
                              </TableCell>
                            )}
                            <TableCell className="text-right">
                              <Button size="sm" variant="ghost" className="h-8 text-indigo-600" onClick={() => viewBoleta(sale)}>
                                <FileText className="w-3 h-3 mr-1" />
                                <span className="hidden sm:inline">Boleta</span>
                              </Button>
                              <Button size="sm" variant="ghost" className="h-8 text-blue-600" onClick={() => viewSaleDetail(sale)}>
                                <Eye className="w-3 h-3 mr-1" />
                                <span className="hidden sm:inline">Ver</span>
                              </Button>
                              {userRole === 'admin' && (
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => {
                                  setSaleToDelete(sale);
                                  setIsDeleteSaleOpen(true);
                                }}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

        {userRole === 'admin' && (
          <TabsContent value="historial-diario" className="space-y-4 sm:space-y-6">
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="flex items-center justify-between">
                  <span>Historial Diario</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 sm:pt-0">
                <div className="border-t sm:border rounded-lg overflow-hidden">
                  <div className="overflow-auto h-[500px]">
                    <Table>
                      <TableHeader className="sticky top-0 bg-white z-10">
                        <TableRow className="bg-gray-50/50">
                          <TableHead className="border-r">Fecha</TableHead>
                          <TableHead className="border-r text-right">Total</TableHead>
                          <TableHead className="border-r text-right">Ganancia</TableHead>
                          <TableHead className="border-r text-center">Ventas</TableHead>
                          <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dailyCloses.slice().sort((a,b) => b.date.localeCompare(a.date)).map((dailyClose) => (
                          <TableRow key={dailyClose.id} className="hover:bg-gray-50/50 text-xs sm:text-sm">
                            <TableCell className="border-r font-medium">
                              {formatearFechaLocal(dailyClose.date)}
                              <span className="block text-[10px] text-gray-400">{formatCloseTime(dailyClose.closeTime)}</span>
                            </TableCell>
                            <TableCell className="border-r text-right font-bold text-green-600">S/ {dailyClose.totalSales.toFixed(2)}</TableCell>
                            <TableCell className="border-r text-right font-bold text-purple-600">S/ {dailyClose.totalProfit.toFixed(2)}</TableCell>
                            <TableCell className="border-r text-center">{dailyClose.salesCount}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-purple-600" onClick={() => { setSelectedCloseDetail(dailyClose); setIsProductosVendidosOpen(true); }}>
                                  <Package className="w-4 h-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600" onClick={() => { setSelectedCloseDetail(dailyClose); setIsVentasIndividualesOpen(true); }}>
                                  <ShoppingCart className="w-4 h-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600" onClick={() => viewCloseDetail(dailyClose)}>
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => openDeleteCloseDialog(dailyClose)}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {userRole === 'admin' && (
          <TabsContent value="usuarios" className="space-y-4 sm:space-y-6">
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="flex items-center justify-between">
                  <span>Gestión de Usuarios</span>
                  <Dialog open={isAddUserOpen} onOpenChange={(open) => { setIsAddUserOpen(open); if (!open) setFieldErrors({}); }}>
                    <DialogTrigger asChild>
                      <Button className="bg-blue-600 hover:bg-blue-700 text-white h-9">
                        <UserPlus className="w-4 h-4 mr-2" />
                        <span className="hidden sm:inline">Nuevo Usuario</span>
                        <span className="sm:hidden">Nuevo</span>
                      </Button>
                    </DialogTrigger>
                      <DialogContent className="sm:max-w-[400px]">
                      <DialogHeader>
                        <DialogTitle>Agregar Nuevo Usuario</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Nombre Completo</Label>
                          <Input
                            className={fieldErrors.name ? "border-red-500" : ""}
                            placeholder="Ej: Juan Pérez"
                            value={newUser.name}
                            onChange={(e) => { setNewUser({ ...newUser, name: e.target.value }); setFieldErrors(prev => ({ ...prev, name: '' })); }} />
                        </div>
                        <div className="space-y-2">
                          <Label>Correo Electrónico</Label>
                          <Input
                            type="email"
                            className={fieldErrors.email ? "border-red-500" : ""}
                            placeholder="Ej: juan@correo.com"
                            value={newUser.email}
                            onChange={(e) => { setNewUser({ ...newUser, email: e.target.value }); setFieldErrors(prev => ({ ...prev, email: '' })); }} />
                        </div>
                        {newUser.role !== 'admin' && (
                        <>
                        <div className="space-y-2">
                          <Label>Contraseña</Label>
                          <div className="relative">
                            <Input
                              type={showPassword ? 'text' : 'password'}
                              className={fieldErrors.password ? "border-red-500" : ""}
                              placeholder="Contraseña segura"
                              value={newUser.password}
                              autoComplete="new-password"
                              onChange={(e) => { setNewUser({ ...newUser, password: e.target.value }); setFieldErrors(prev => ({ ...prev, password: '' })); }} />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full px-3"
                              onClick={() => setShowPassword(!showPassword)}
                            >
                              {showPassword ? <EyeOff className="w-4 h-4 text-slate-400" /> : <Eye className="w-4 h-4 text-slate-400" />}
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Confirmar Contraseña</Label>
                          <div className="relative">
                            <Input
                              type={showConfirmPassword ? 'text' : 'password'}
                              className={fieldErrors.confirmPassword ? "border-red-500" : ""}
                              placeholder="Repite la contraseña"
                              value={confirmPassword}
                              autoComplete="new-password"
                              onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors(prev => ({ ...prev, confirmPassword: '' })); }} />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full px-3"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            >
                              {showConfirmPassword ? <EyeOff className="w-4 h-4 text-slate-400" /> : <Eye className="w-4 h-4 text-slate-400" />}
                            </Button>
                          </div>
                        </div>
                        </>
                        )}
                        {newUser.role === 'admin' && (
                          <>
                          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-3">
                            <div className="flex gap-2">
                              <User className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-xs font-medium text-indigo-800">Acceso con correo y contraseña</p>
                                <p className="text-[11px] text-indigo-600 mt-0.5">La cuenta la crea el administrador en Supabase. El rol y el nombre se toman del perfil.</p>
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Contraseña</Label>
                            <div className="relative">
                              <Input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Opcional - para cuando no hay internet"
                                value={newUser.password}
                                autoComplete="new-password"
                                onChange={(e) => { setNewUser({ ...newUser, password: e.target.value }); setFieldErrors(prev => ({ ...prev, password: '' })); }} />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-0 top-0 h-full px-3"
                                onClick={() => setShowPassword(!showPassword)}
                              >
                                {showPassword ? <EyeOff className="w-4 h-4 text-slate-400" /> : <Eye className="w-4 h-4 text-slate-400" />}
                              </Button>
                            </div>
                          </div>
                          </>
                        )}
                        <div className="space-y-2">
                          <Label>Rol</Label>
                          <Select value={newUser.role} onValueChange={(value: 'admin' | 'empleado') => {
                            setNewUser({ ...newUser, role: value });
                            if (value === 'admin') {
                              setNewUser(prev => ({ ...prev, password: '', role: 'admin' }));
                              setConfirmPassword('');
                            }
                          }}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="empleado">Empleado</SelectItem>
                              <SelectItem value="admin">Administrador</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={agregarUsuario} className="w-full bg-blue-600 hover:bg-blue-700">Agregar Usuario</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 sm:pt-0">
                <div className="border-t sm:border rounded-lg">
                  <div className="overflow-auto h-[500px]">
                    <Table>
                      <TableHeader className="sticky top-0 bg-white z-10">
                        <TableRow className="bg-gray-50/50">
                          <TableHead className="border-r">Nombre</TableHead>
                          <TableHead className="border-r">Correo</TableHead>
                          <TableHead className="border-r">Rol</TableHead>
                          <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((user) => (
                          <TableRow key={user.id} className="hover:bg-gray-50/50 text-xs sm:text-sm">
                            <TableCell className="font-medium border-r">{user.name}</TableCell>
                            <TableCell className="border-r text-gray-500">{user.email || '-'}</TableCell>
                            <TableCell className="border-r">
                              <Badge variant={user.role === 'admin' ? "default" : "secondary"} className="text-[10px] capitalize">
                                {user.role}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-slate-600"
                                  onClick={() => setViewUser(user)}
                                  title="Ver usuario"
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-blue-600"
                                  onClick={() => editarUsuario(user)}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-red-600"
                                  onClick={() => user.role === 'empleado' ? setUsuarioAEliminar(user) : null}
                                  disabled={user.role === 'admin' || getCurrentSupabaseUser()?.email === user.email}
                                  title={user.role === 'admin' ? 'Los administradores no se eliminan desde la app' : 'Eliminar empleado'}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
      <Dialog open={isCloseCashOpen} onOpenChange={setIsCloseCashOpen}>
        <DialogContent className="sm:max-w-[600px] md:max-w-[800px]">
          <DialogHeader>
            <DialogTitle>¿Cerrar caja del día {new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-sm text-gray-600">Total</p>
                  <p className="text-xl font-bold text-green-600">
                    S/ {todaysSales.reduce((sum, sale) => sum + sale.total, 0).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Productos</p>
                  <p className="text-xl font-bold text-blue-600">
                    {todaysSales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => {
                      return item.product.type === 'peso' ? itemSum + 1 : itemSum + item.quantity;
                    }, 0), 0)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Ganancias</p>
                  <p className="text-xl font-bold text-purple-600">
                    S/ {todaysSales.reduce((sum, sale) => sum + sale.totalProfit, 0).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600"># Ventas</p>
                  <p className="text-xl font-bold text-orange-600">{todaysSales.length}</p>
                </div>
              </div>
              <Separator className="my-3" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-green-100 rounded-lg p-3 text-center">
                  <p className="text-xs font-bold uppercase text-green-700">Efectivo</p>
                  <p className="text-lg font-bold text-green-800">
                    S/ {todaysSales.filter(s => s.paymentMethod === 'efectivo').reduce((sum, s) => sum + s.total, 0).toFixed(2)}
                  </p>
                </div>
                <div className="bg-orange-100 rounded-lg p-3 text-center">
                  <p className="text-xs font-bold uppercase text-orange-700">Tarjeta</p>
                  <p className="text-lg font-bold text-orange-800">
                    S/ {todaysSales.filter(s => s.paymentMethod === 'tarjeta').reduce((sum, s) => sum + s.total, 0).toFixed(2)}
                  </p>
                </div>
                <div className="bg-purple-100 rounded-lg p-3 text-center">
                  <p className="text-xs font-bold uppercase text-purple-700">Yape</p>
                  <p className="text-lg font-bold text-purple-800">
                    S/ {todaysSales.filter(s => s.paymentMethod === 'yape').reduce((sum, s) => sum + s.total, 0).toFixed(2)}
                  </p>
                </div>
                <div className="bg-gray-100 rounded-lg p-3 text-center">
                  <p className="text-xs font-bold uppercase text-gray-700">Plin</p>
                  <p className="text-lg font-bold text-gray-800">
                    S/ {todaysSales.filter(s => s.paymentMethod === 'plin').reduce((sum, s) => sum + s.total, 0).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" onClick={() => setIsCloseCashOpen(false)} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={cerrarCaja} className="flex-1 success-gradient text-white">
                Confirmar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog><Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle de Venta</DialogTitle>

          </DialogHeader>
          {selectedSaleDetail && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Fecha</p>
                  <p className="font-medium">{new Date(selectedSaleDetail.date).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                  <p className="text-sm text-gray-600 mt-1">{new Date(selectedSaleDetail.date).toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit', hour12: true })}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Método de pago</p>
                  <Badge variant="outline" className={getPaymentMethodColor(selectedSaleDetail.paymentMethod)}>
                    {selectedSaleDetail.paymentMethod}
                  </Badge>
                </div>

                <div>
                  <p className="text-sm text-gray-600">ID</p>
                  <p className="font-medium font-mono text-slate-700">{selectedSaleDetail.id}</p>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-3">PRODUCTOS VENDIDOS</h4>
                <div className="space-y-3">
                  {selectedSaleDetail.items.map((item, index) => {
                      const isMayoristaItem = item.product.type === 'mayorista' || (!!item.selectedLevelName && item.selectedLevelName !== 'Unidad');
                      const itemTotal = (() => {
                        if (item.product.type === 'peso') {
                          return (item.product.salePricePerKg || 0) * (item.quantity / 1000);
                        } else if (isMayoristaItem) {
                          return (item.product.salePrice || 0) * item.quantity;
                        } else {
                          return (item.product.salePrice || 0) * item.quantity;
                        }
                      })();

                    const getItemProfit = () => {
                      if (item.product.type === 'peso') {
                        const totalKg = item.quantity / 1000;
                        const profitPerKg = (item.product.salePricePerKg || 0) - (item.product.purchasePricePerKg || 0);
                        return profitPerKg * totalKg;
                      } else if (isMayoristaItem) {
                        return ((item.product.salePrice || 0) - (item.product.purchasePrice || 0)) * item.quantity;
                      } else {
                        return ((item.product.salePrice || 0) - (item.product.purchasePrice || 0)) * item.quantity;
                      }
                    };
                    const itemProfit = getItemProfit();
                    const typeKey = isMayoristaItem ? 'mayorista' : item.product.type === 'peso' ? 'peso' : !item.selectedLevelName ? 'unidad-simple' : 'unidad';
                    const palette = {
                      mayorista: { header: 'bg-pink-100 text-pink-900', badge: 'bg-pink-200 text-pink-800 border-pink-300', total: 'bg-pink-600', border: 'border-pink-200' },
                      peso: { header: 'bg-amber-100 text-amber-900', badge: 'bg-amber-200 text-amber-800 border-amber-300', total: 'bg-amber-600', border: 'border-amber-200' },
                      'unidad-simple': { header: 'bg-teal-100 text-teal-900', badge: 'bg-teal-200 text-teal-800 border-teal-300', total: 'bg-teal-600', border: 'border-teal-200' },
                      unidad: { header: 'bg-blue-100 text-blue-900', badge: 'bg-blue-200 text-blue-800 border-blue-300', total: 'bg-blue-600', border: 'border-blue-200' }
                    }[typeKey];

                    return (
                      <div key={index} className={`rounded-lg border ${palette.border} bg-white overflow-hidden shadow-sm`}>
                          <div className={`flex justify-between items-center px-4 py-3 ${palette.header}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-gray-900 truncate">{item.product.name}</span>
                            <Badge variant="secondary" className={`text-[10px] ${palette.badge}`}>
                              {isMayoristaItem ? 'Mayorista' : item.product.type === 'peso' ? 'Peso' : !item.selectedLevelName ? 'Unidad Simple' : 'Unidad'}
                            </Badge>
                          </div>
                          <div className={`${palette.total} px-3 py-1 rounded-lg flex-shrink-0`}>
                            <p className="font-semibold text-lg text-white">
                              Total: S/ {itemTotal.toFixed(2)}
                            </p>
                          </div>
                        </div>
                        <div className="p-4">
                          {isMayoristaItem ? (
                            <div className="flex gap-4">
                              {(products.find(p => p.id === item.product.id)?.imageUrl) && (
                                <img src={products.find(p => p.id === item.product.id)?.imageUrl} alt={item.product.name} className="w-28 h-28 object-cover rounded-lg border flex-shrink-0" />
                              )}
                              <div className="grid grid-cols-2 gap-x-6 gap-y-2 flex-1">
                                <div>
                                  <p className="text-sm text-gray-600 mb-1">Nivel vendido</p>
                                  <p className="font-medium text-gray-900">{item.selectedLevelName}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-600 mb-1">Cantidad</p>
                                  <p className="font-medium">{item.quantity} {item.selectedLevelName?.toLowerCase()}{item.quantity !== 1 ? 's' : ''}</p>
                                </div>
                                {isMayoristaItem && (
                                  <div>
                                    <p className="text-sm text-gray-600 mb-1">P. Compra</p>
                                    <p className="font-medium text-gray-900">S/ {(item.product.purchasePrice || 0).toFixed(2)}</p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-sm text-gray-600 mb-1">P. Venta</p>
                                  <p className="font-medium text-green-700">S/ {(item.product.salePrice || 0).toFixed(2)}</p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-4 items-center">
                              {(products.find(p => p.id === item.product.id)?.imageUrl) && (
                                <img src={products.find(p => p.id === item.product.id)?.imageUrl} alt={item.product.name} className="w-32 h-32 object-cover rounded-lg border flex-shrink-0" />
                              )}
                              <div className="grid grid-cols-2 gap-x-6 gap-y-2 flex-1">
                                <div>
                                  <p className="text-sm text-gray-600 mb-1">Cantidad</p>
                                  <p className="font-bold text-lg text-gray-900">
                                    {item.product.type === 'peso' ? formatWeight(item.quantity) : `${item.quantity} ${item.product.baseUnit || 'unid.'}`}
                                  </p>
                                </div>
                                {userRole === 'admin' && (
                                  <div>
                                    <p className="text-sm text-gray-600 mb-1">P. Compra</p>
                                    <p className="font-medium text-gray-900">
                                      S/ {(item.product.purchasePrice || 0).toFixed(2)}
                                    </p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-sm text-gray-600 mb-1">P. Venta</p>
                                  <p className="font-medium text-green-700">
                                    {item.product.type === 'peso'
                                      ? `S/ ${((item.product.salePricePerKg || 0) / 1000).toFixed(3)}`
                                      : `S/ ${(item.product.salePrice || 0).toFixed(2)}`}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        {userRole === 'admin' && (
                          <div className="flex items-center justify-between px-4 py-3 bg-gray-100 border-t border-gray-200">
                            <div className="flex items-center gap-2 min-w-0">
                              <CheckCircle2 className="w-4 h-4 text-gray-500 flex-shrink-0" />
                              <span className="font-medium text-sm text-gray-500 truncate">{item.product.name}</span>
                            </div>
                            <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-300 flex-shrink-0">
                              Ganancia: S/ {itemProfit.toFixed(2)}
                            </Badge>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-medium">S/ {selectedSaleDetail.subtotal.toFixed(2)}</span>
                </div>

                <Separator />
                <div className="flex justify-between text-xl font-bold text-yellow-600 bg-yellow-50 p-3 rounded-lg">
                  <span>Total:</span>
                  <span>S/ {selectedSaleDetail.total.toFixed(2)}</span>
                </div>
                {userRole === 'admin' && (
                  <div className="flex justify-between text-lg font-semibold text-green-700 pt-2 border-t border-green-200">
                    <span>Ganancia Total:</span>
                    <span>S/ {selectedSaleDetail.totalProfit.toFixed(2)}</span>
                  </div>
                )}
                {selectedSaleDetail.paymentMethod === 'efectivo' && (
                  <>
                    <div className="flex justify-between text-sm font-medium">
                      <span className="text-gray-600">Monto Recibido:</span>
                      <span>S/ {selectedSaleDetail.amountPaid?.toFixed(2) || '0.00'}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold">
                      <span>Cambio:</span>
                      <span>S/ {selectedSaleDetail.change?.toFixed(2) || '0.00'}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog><Dialog open={isCloseDetailOpen} onOpenChange={setIsCloseDetailOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Detalle del Cierre Diario</DialogTitle>
          </DialogHeader>
          {selectedCloseDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Fecha</p>
                  <p className="font-medium">{formatearFechaLocal(selectedCloseDetail.date)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Hora de Cierre</p>
                  <p className="font-medium">
                    {formatCloseTime(selectedCloseDetail.closeTime)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Cerrado por</p>
                  <p className="font-medium capitalize">{selectedCloseDetail.closedBy}</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium">Resumen de Ventas</h4>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                    <div className="flex justify-between">
                      <span>Total Vendido:</span>
                      <span className="font-semibold">S/ {selectedCloseDetail.totalSales.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Ganancias:</span>
                      <span className="font-semibold text-green-600">S/ {selectedCloseDetail.totalProfit.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Productos Vendidos:</span>
                      <span className="font-semibold">{selectedCloseDetail.totalItems}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Número de Ventas:</span>
                      <span className="font-semibold">{selectedCloseDetail.salesCount}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Métodos de Pago</h4>
                  <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <Banknote className="w-4 h-4 text-green-600" />
                        <span>Efectivo:</span>
                      </div>
                      <span className="font-semibold">S/ {selectedCloseDetail.paymentMethods.efectivo.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <CreditCard className="w-4 h-4 text-orange-600" />
                        <span>Tarjeta:</span>
                      </div>
                      <span className="font-semibold">S/ {selectedCloseDetail.paymentMethods.tarjeta.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <Smartphone className="w-4 h-4 text-purple-600" />
                        <span>Yape:</span>
                      </div>
                      <span className="font-semibold">S/ {selectedCloseDetail.paymentMethods.yape.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <Package className="w-4 h-4 text-cyan-600" />
                        <span>Plin:</span>
                      </div>
                      <span className="font-semibold">S/ {selectedCloseDetail.paymentMethods.plin.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isProductosVendidosOpen} onOpenChange={setIsProductosVendidosOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Resumen por Producto</DialogTitle>
          </DialogHeader>
          {selectedCloseDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Fecha</p>
                  <p className="font-medium">{formatearFechaLocal(selectedCloseDetail.date)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Hora de Cierre</p>
                  <p className="font-medium">{formatCloseTime(selectedCloseDetail.closeTime)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Cerrado por</p>
                  <p className="font-medium capitalize">{selectedCloseDetail.closedBy}</p>
                </div>
              </div>

              <Separator />

              <div className="max-h-96 overflow-y-auto p-2">
                {(() => {
                  try {
                    if (!selectedCloseDetail || !selectedCloseDetail.date) {
                      return <div className="text-center p-4">No hay datos disponibles</div>;
                    }
                    
                    const savedTransactions = selectedCloseDetail.transacciones;
                    const daysSales = savedTransactions && savedTransactions.length > 0
                      ? savedTransactions
                      : sales.filter(sale => {
                          try {
                            const saleDate = (sale.localDate || getLocalDateStr(new Date(sale.date)));
                            return saleDate === selectedCloseDetail.date;
                          } catch (error) {
                            console.error('Error al comparar fechas:', error);
                            return false;
                          }
                        });
                    
                    const productSummary: {
                      [key: string]: {
                        quantity: number;
                        currentStock: number;
                        salePrice: number;
                        purchasePrice: number;
                        total: number;
                        profit: number;
                        type: string;
                      };
                    } = {};
                    
                    const levelSummary: {
                      [key: string]: {
                        productName: string;
                        levelName: string;
                        quantity: number;
                        salePrice: number;
                        purchasePrice: number;
                        total: number;
                        profit: number;
                      };
                    } = {};

                    const inventoryProducts = products || [];

                    daysSales.forEach(sale => {
                      if (!sale.items || !Array.isArray(sale.items)) return;
                      
                      sale.items.forEach(item => {
                        if (!item.product || !item.product.name) return;
                        
                        if (item.product.type === 'mayorista' || (item.product.type === 'unidad' && item.selectedLevelName)) {
                          if (item.selectedLevelName) {
                            const lKey = `${item.product.name}|${item.selectedLevelName}`;
                            if (!levelSummary[lKey]) {
                              levelSummary[lKey] = {
                                productName: item.product.name,
                                levelName: item.selectedLevelName,
                                quantity: 0,
                                salePrice: item.product.salePrice || 0,
                                purchasePrice: item.product.purchasePrice || 0,
                                total: 0,
                                profit: 0
                              };
                            }
                            levelSummary[lKey].quantity += item.quantity || 0;
                            levelSummary[lKey].total += (item.product.salePrice || 0) * (item.quantity || 0);
                            levelSummary[lKey].profit += ((item.product.salePrice || 0) - (item.product.purchasePrice || 0)) * (item.quantity || 0);
                          }
                          if (item.product.type === 'mayorista' || item.selectedLevelName !== 'Unidad') return;
                        }
                        
                        const inventoryProduct = inventoryProducts.find(p => p.name === item.product.name);
                        
                        if (!productSummary[item.product.name]) {
                          productSummary[item.product.name] = {
                            quantity: 0,
                            currentStock: inventoryProduct?.stock || 0,
                            salePrice: item.product.salePrice || 0,
                            purchasePrice: item.product.purchasePrice || 0,
                            total: 0,
                            profit: 0,
                            type: item.product.type
                          };
                        }
                        
                        if (item.product.type === 'peso') {
                          const totalKg = item.quantity / 1000;
                          const profitPerKg = (item.product.salePricePerKg || 0) - (item.product.purchasePricePerKg || 0);
                          productSummary[item.product.name].quantity += item.quantity || 0;
                          productSummary[item.product.name].total += (item.product.salePricePerKg || 0) * totalKg;
                          productSummary[item.product.name].profit += profitPerKg * totalKg;
                        } else {
                          productSummary[item.product.name].quantity += item.quantity || 0;
                          productSummary[item.product.name].total += (item.product.salePrice || 0) * (item.quantity || 0);
                          productSummary[item.product.name].profit += ((item.product.salePrice || 0) - (item.product.purchasePrice || 0)) * (item.quantity || 0);
                        }
                      });
                    });

                    const regularEntries = Object.entries(productSummary);
                    const levelEntries = Object.values(levelSummary);
                    
                    const filteredRegularEntries = regularEntries.filter(([name]) =>
                      !resumenSearch.trim() || normalizeText(name).includes(normalizeSearch(resumenSearch))
                    );
                    const filteredLevelEntries = levelEntries.filter(item =>
                      !resumenSearch.trim() || normalizeText(item.productName).includes(normalizeSearch(resumenSearch))
                    );
                    
                    const hasRegular = filteredRegularEntries.length > 0;
                    const hasMayorista = filteredLevelEntries.length > 0;

                    const activeTab: 'regular' | 'mayorista' = !hasRegular ? 'mayorista' : !hasMayorista ? 'regular' : resumenTab;
                    const showSelector = true;

                    return (
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          {showSelector && (
                            <div className="flex bg-slate-200/50 p-1 rounded-xl w-fit">
                              <Button
                                variant={activeTab === 'regular' ? 'secondary' : 'ghost'}
                                size="sm"
                                onClick={() => setResumenTab('regular')}
                                className={`h-8 rounded-lg text-xs font-bold uppercase tracking-widest ${activeTab === 'regular' ? 'bg-slate-700 text-white hover:bg-slate-800 shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
                              >
                                Unidad / Peso
                              </Button>
                              <Button
                                variant={activeTab === 'mayorista' ? 'secondary' : 'ghost'}
                                size="sm"
                                onClick={() => setResumenTab('mayorista')}
                                className={`h-8 rounded-lg text-xs font-bold uppercase tracking-widest ${activeTab === 'mayorista' ? 'bg-slate-700 text-white hover:bg-slate-800 shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
                              >
                                Ventas por Mayor
                              </Button>
                            </div>
                          )}
                          <div className="relative flex-1 max-w-xs">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                            <Input
                              placeholder="Buscar producto..."
                              value={resumenSearch}
                              onChange={(e) => setResumenSearch(e.target.value)}
                              className="pl-10 h-8 text-sm border-slate-200 focus:border-indigo-500 rounded-lg" />
                          </div>
                        </div>

                        {!hasRegular && !hasMayorista ? (
                          <div className="text-center py-6 text-gray-500">No hay productos vendidos en esta fecha</div>
                        ) : (
                          <>

                        {activeTab === 'regular' && hasRegular && (
                          <div>
                            <Table>
                              <TableHeader className="sticky top-0 bg-white z-10">
                                <TableRow className="bg-gray-50/50">
                                  <TableHead className="border-r">Producto</TableHead>
                                  <TableHead className="border-r text-center">Stock Actual</TableHead>
                                  <TableHead className="border-r text-center">Vendido</TableHead>
                                  <TableHead className="border-r text-center">P. Venta</TableHead>
                                  <TableHead className="border-r text-right">Total Venta</TableHead>
                                  {userRole === 'admin' && (
                                    <>
                                      <TableHead className="border-r text-center">P. Compra</TableHead>
                                      <TableHead className="text-right">Ganancia</TableHead>
                                    </>
                                  )}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredRegularEntries.map(([name, data]) => {
                                  const product = inventoryProducts.find(p => p.name === name);
                                  return (
                                  <TableRow key={name} className="hover:bg-gray-50/50">
                                    <TableCell className="font-medium border-r">
                                      <div className="flex items-center gap-3">
                                        {product?.imageUrl ? (
                                          <img src={product.imageUrl} alt={name} className="w-10 h-10 object-cover rounded-md flex-shrink-0 border" />
                                        ) : (
                                          <div className="w-10 h-10 rounded-md bg-slate-100 border flex items-center justify-center flex-shrink-0">
                                            <Package className="w-5 h-5 text-slate-400" />
                                          </div>
                                        )}
                                        <span className="text-sm font-semibold">{name}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-center font-semibold border-r">
                                      {product?.type === 'peso' ? formatWeight(data.currentStock) : data.currentStock}
                                    </TableCell>
                                    <TableCell className="text-center font-semibold text-amber-600 border-r">
                                      {product?.type === 'peso' ? formatWeight(data.quantity) : data.type === 'unidad' ? `${data.quantity} unid` : data.quantity}
                                    </TableCell>
                                    <TableCell className="text-center border-r">
                                      {product?.type === 'peso'
                                        ? `S/ ${(product.salePricePerKg || 0).toFixed(2)}/kg`
                                        : `S/ ${(data.salePrice || 0).toFixed(2)}`}
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-green-600 border-r">
                                      S/ {(data.total || 0).toFixed(2)}
                                    </TableCell>
                                    {userRole === 'admin' && (
                                      <>
                                        <TableCell className="text-center border-r">
                                          S/ {(data.purchasePrice || 0).toFixed(2)}
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-purple-600">
                                          S/ {Math.max(0, data.profit).toFixed(2)}
                                        </TableCell>
                                      </>
                                    )}
                                  </TableRow>
                                );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        )}

                        {activeTab === 'mayorista' && hasMayorista && (
                          <div>
                            <Table>
                              <TableHeader className="sticky top-0 bg-white z-10">
                                <TableRow className="bg-purple-50/30">
                                  <TableHead className="border-r">Producto</TableHead>
                                  <TableHead className="border-r text-center">Nivel</TableHead>
                                  <TableHead className="border-r text-center">Vendido</TableHead>
                                  <TableHead className="border-r text-center">Stock Actual</TableHead>
                                  <TableHead className="border-r text-center">P. Venta</TableHead>
                                  <TableHead className="border-r text-right">Total</TableHead>
                                  {userRole === 'admin' && (
                                    <>
                                      <TableHead className="border-r text-center">P. Compra</TableHead>
                                      <TableHead className="text-right">Ganancia</TableHead>
                                    </>
                                  )}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredLevelEntries.map((item, idx) => {
                                  const product = inventoryProducts.find(p => p.name === item.productName);
                                  const level = product?.saleLevels?.find(l => l.name === item.levelName);
                                  return (
                                  <TableRow key={`${item.productName}-${item.levelName}-${idx}`} className="hover:bg-purple-50/30">
                                    <TableCell className="font-medium border-r">
                                      <div className="flex items-center gap-3">
                                        {product?.imageUrl ? (
                                          <img src={product.imageUrl} alt={item.productName} className="w-10 h-10 object-cover rounded-md flex-shrink-0 border" />
                                        ) : (
                                          <div className="w-10 h-10 rounded-md bg-slate-100 border flex items-center justify-center flex-shrink-0">
                                            <Package className="w-5 h-5 text-slate-400" />
                                          </div>
                                        )}
                                        <span className="text-sm font-semibold">{item.productName}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-center font-semibold text-purple-700 border-r">
                                      {item.levelName}
                                    </TableCell>
                                    <TableCell className="text-center font-semibold text-amber-600 border-r">
                                      {item.levelName === 'Unidad' ? `${item.quantity} unid` : `${item.quantity} ${item.levelName.toLowerCase()} (${item.quantity * (level?.baseUnitsContained || 1)} unid)`}
                                    </TableCell>
                                    <TableCell className="text-center border-r">
                                      {product?.stock != null ? `${product.stock} unid` : '-'}
                                    </TableCell>
                                    <TableCell className="text-center border-r">
                                      S/ {(item.salePrice || 0).toFixed(2)} /{item.levelName}
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-green-600 border-r">
                                      S/ {(item.total || 0).toFixed(2)}
                                    </TableCell>
                                    {userRole === 'admin' && (
                                      <>
                                        <TableCell className="text-center border-r">
                                          S/ {(item.purchasePrice || 0).toFixed(2)} /{item.levelName}
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-purple-600">
                                          S/ {(Math.max(0, item.profit) || 0).toFixed(2)}
                                        </TableCell>
                                      </>
                                    )}
                                  </TableRow>
                                );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                          </>
                        )}
                      </div>
                    );
                  } catch (error) {
                    console.error('Error al renderizar productos vendidos:', error);
                    return <div className="text-center py-6 text-red-500">Error al cargar los datos</div>;
                  }
                })()}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isVentasIndividualesOpen} onOpenChange={setIsVentasIndividualesOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Transacciones</DialogTitle>
          </DialogHeader>
          {selectedCloseDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Fecha</p>
                  <p className="font-medium">{formatearFechaLocal(selectedCloseDetail.date)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Hora de Cierre</p>
                  <p className="font-medium">{formatCloseTime(selectedCloseDetail.closeTime)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Cerrado por</p>
                  <p className="font-medium capitalize">{selectedCloseDetail.closedBy}</p>
                </div>
              </div>

              <Separator />

              <div className="flex items-center gap-3">
                <div className="flex bg-slate-200/50 p-1 rounded-xl w-fit">
                  <Button
                    variant={transaccionesFilter === 'all' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setTransaccionesFilter('all')}
                    className={`h-7 rounded-lg text-[10px] font-bold uppercase tracking-widest ${transaccionesFilter === 'all' ? 'bg-slate-700 text-white hover:bg-slate-800 shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    Todas
                  </Button>
                  <Button
                    variant={transaccionesFilter === 'regular' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setTransaccionesFilter('regular')}
                    className={`h-7 rounded-lg text-[10px] font-bold uppercase tracking-widest ${transaccionesFilter === 'regular' ? 'bg-slate-700 text-white hover:bg-slate-800 shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    Regulares
                  </Button>
                  <Button
                    variant={transaccionesFilter === 'mayorista' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setTransaccionesFilter('mayorista')}
                    className={`h-7 rounded-lg text-[10px] font-bold uppercase tracking-widest ${transaccionesFilter === 'mayorista' ? 'bg-slate-700 text-white hover:bg-slate-800 shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    Mayoristas
                  </Button>
                </div>
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <Input
                    placeholder="Buscar por producto o ID..."
                    value={transaccionesSearch}
                    onChange={(e) => setTransaccionesSearch(e.target.value)}
                    className="pl-10 h-8 text-sm border-slate-200 focus:border-indigo-500 rounded-lg" />
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto p-2">
                {(() => {
                  try {
                    if (!selectedCloseDetail || !selectedCloseDetail.date) {
                      return <div className="text-center p-4">No hay datos disponibles</div>;
                    }
                    
                    const savedTransactions = selectedCloseDetail.transacciones;
                    const daysSales = savedTransactions && savedTransactions.length > 0
                      ? savedTransactions
                      : sales.filter(sale => {
                          try {
                            const saleDate = (sale.localDate || getLocalDateStr(new Date(sale.date)));
                            return saleDate === selectedCloseDetail.date;
                          } catch (error) {
                            console.error('Error al comparar fechas:', error);
                            return false;
                          }
                        });
                    
                    const filteredDaysSales = daysSales.filter(sale => {
                      if (transaccionesFilter === 'regular') return sale.items.some(item => item.product.type !== 'mayorista' && (!item.selectedLevelName || item.selectedLevelName === 'Unidad'));
                      if (transaccionesFilter === 'mayorista') return sale.items.some(item => item.product.type === 'mayorista' || (item.selectedLevelName && item.selectedLevelName !== 'Unidad'));
                      return true;
                    }).filter(sale => {
                      if (!transaccionesSearch.trim()) return true;
                      return (
                        sale.id.toLowerCase().includes(transaccionesSearch.toLowerCase()) ||
                        sale.items.some(item => normalizeText(item.product?.name || '').includes(normalizeSearch(transaccionesSearch)))
                      );
                    });
                    
                    if (filteredDaysSales.length === 0) {
                      return <div className="text-center p-4">No hay ventas en esta fecha</div>;
                    }
                    
                    return filteredDaysSales.map((sale) => {
                      const hasUnidad = sale.items.some(item => item.selectedLevelName === 'Unidad');
                      const hasUnidadSimple = sale.items.some(item => item.product.type === 'unidad' && !item.selectedLevelName);
                      const hasMayorista = sale.items.some(item => item.product.type === 'mayorista' || (item.selectedLevelName && item.selectedLevelName !== 'Unidad'));
                      const hasPeso = sale.items.some(item => item.product.type === 'peso');
                      return (
                      <Card key={sale.id} className={`mb-3 cursor-pointer hover:shadow-md transition-shadow ${sale.paymentMethod === 'efectivo' ? 'border-l-4 border-l-green-500 bg-gradient-to-r from-green-50/50 to-white' : sale.paymentMethod === 'yape' ? 'border-l-4 border-l-purple-500 bg-gradient-to-r from-purple-50/50 to-white' : sale.paymentMethod === 'plin' ? 'border-l-4 border-l-sky-500 bg-gradient-to-r from-sky-50/50 to-white' : sale.paymentMethod === 'tarjeta' ? 'border-l-4 border-l-orange-500 bg-gradient-to-r from-orange-50/50 to-white' : ''}`} onClick={() => {
                        setSelectedSaleDetail(sale);
                        setIsDetailOpen(true);
                      }}>
                        <CardHeader className="pb-2">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center space-x-3">
                              <Clock className="w-4 h-4 text-gray-500" />
                              <span className="font-medium">{new Date(sale.date).toLocaleTimeString('es-ES', { hour12: true, hour: '2-digit', minute: '2-digit' })}</span>
                              <Badge variant="outline" className="bg-gray-50 text-gray-700">
                                {sale.id}
                              </Badge>
                              {hasUnidad && (
                                <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px]">
                                  Unidad
                                </Badge>
                              )}
                              {hasUnidadSimple && (
                                <Badge className="bg-teal-100 text-teal-700 border-teal-200 text-[10px]">
                                  Unidad Simple
                                </Badge>
                              )}
                              {hasMayorista && (
                                <Badge className="bg-pink-100 text-pink-700 border-pink-200 text-[10px]">
                                  Mayorista
                                </Badge>
                              )}
                              {hasPeso && (
                                <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">
                                  Peso
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center space-x-2">
                              <Badge variant="outline" className={getPaymentMethodColor(sale.paymentMethod)}>
                                {sale.paymentMethod.toUpperCase()}
                              </Badge>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="flex justify-end items-center">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-lg">S/ {sale.total.toFixed(2)}</span>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" variant="ghost" className="h-7 text-indigo-600 text-[10px]" onClick={() => viewBoleta(sale)}>
                              📋 Boleta
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-blue-600 text-[10px]" onClick={() => reimprimirBoleta(sale)}>
                              🖨 Imprimir
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )});
                  } catch (error) {
                    console.error('Error al renderizar ventas individuales:', error);
                    return <div className="text-center p-4 text-red-500">Error al cargar ventas</div>;
                  }
                })()}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isEditProductOpen} onOpenChange={setIsEditProductOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Producto</DialogTitle>
          </DialogHeader>
          {editingProduct && (
            <div className="space-y-4">
              <div>
                <Label>Nombre del Producto</Label>
                <Input
                  value={editingProduct.name}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Precio Compra (S/)</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={editingProduct.purchasePrice ? editingProduct.purchasePrice.toFixed(2) : ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const normalized = raw.replace(',', '.');
                      if (raw === '' || /^\d*(?:[.,]\d{0,2})?$/.test(raw)) {
                        const num = normalized === '' ? 0 : parseFloat(normalized) || 0;
                        setEditingProduct({ ...editingProduct, purchasePrice: num });
                      }
                    }}
                    onBlur={(e) => {
                      const v = e.target.value.replace(',', '.');
                      if (v !== '' && !isNaN(Number(v))) {
                        const n = Math.round((parseFloat(v) || 0) * 100) / 100;
                        setEditingProduct({ ...editingProduct, purchasePrice: n });
                      }
                    }} />
                </div>
                <div>
                  <Label>Precio Venta (S/)</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={editingProduct.salePrice ? editingProduct.salePrice.toFixed(2) : ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const normalized = raw.replace(',', '.');
                      if (raw === '' || /^\d*(?:[.,]\d{0,2})?$/.test(raw)) {
                        const num = normalized === '' ? 0 : parseFloat(normalized) || 0;
                        setEditingProduct({ ...editingProduct, salePrice: num });
                      }
                    }}
                    onBlur={(e) => {
                      const v = e.target.value.replace(',', '.');
                      if (v !== '' && !isNaN(Number(v))) {
                        const n = Math.round((parseFloat(v) || 0) * 100) / 100;
                        setEditingProduct({ ...editingProduct, salePrice: n });
                      }
                    }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(() => {
                  const hasSales = stockHistory.some(h => h.productId === editingProduct.id && h.type === 'sale');
                  return (
                    <>
                      <div>
                        <Label>Stock Actual</Label>
                        <Input
                          type="text"
                          placeholder="0"
                          value={editingProduct.stock || ''}
                          onChange={(e) => {
                            if (hasSales) return;
                            const value = e.target.value;
                            if (value === '' || /^\d+$/.test(value)) {
                              setEditingProduct({ ...editingProduct, stock: value === '' ? 0 : parseInt(value) || 0 });
                            }
                          }}
                          className={hasSales ? 'opacity-60 cursor-not-allowed' : ''}
                          disabled={hasSales}
                        />
                      </div>
                      {hasSales && (
                        <div className="col-span-2">
                          <p className="text-[10px] text-amber-600 font-medium">⚠️ Stock bloqueado porque ya se realizaron ventas. Usa <strong>"Restock"</strong> en Historial de Stock.</p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              <div>
                <Label>Categoría</Label>
                <Input
                  value={editingProduct.category}
                  onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })} />
              </div>
              <Separator />
              <div>
                <Label>Imagen del producto</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setEditProductImage(file);
                      const reader = new FileReader();
                      reader.onloadend = () => setEditProductImagePreview(reader.result as string);
                      reader.readAsDataURL(file);
                    }
                  }}
                />
                <div className="mt-3">
                  {editProductImagePreview ? (
                    <img src={editProductImagePreview} alt="Preview" className="w-full h-40 object-cover rounded-lg border" />
                  ) : editingProduct.imageUrl ? (
                    <div className="relative">
                      <img src={editingProduct.imageUrl} alt={editingProduct.name} className="w-full h-40 object-cover rounded-lg border" />
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-6 w-6 rounded-full"
                        onClick={() => {
                          setEditingProduct({ ...editingProduct, imageUrl: undefined });
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="w-full h-32 bg-slate-100 rounded-lg border flex items-center justify-center">
                      <Package className="w-8 h-8 text-slate-300" />
                    </div>
                  )}
                </div>
              </div>
              <Button onClick={guardarEdicionProducto} className="w-full">
                Guardar Cambios
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog><Dialog open={isEditUserOpen} onOpenChange={(open) => {
        setIsEditUserOpen(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuario</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4">
              <div>
                <Label>Nombre Completo</Label>
                <Input
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })} />
              </div>
              <div>
                <Label>Correo Electrónico <span className="text-slate-400 text-xs">(no editable)</span></Label>
                <Input
                  type="email"
                  disabled
                  value={editingUser.email} />
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-xs text-slate-500 leading-relaxed">
                  <span className="font-semibold text-slate-700">¿Olvidó su contraseña?</span>{" "}
                  Ve a Supabase → Authentication → Users → Edit user y colócale una nueva
                  (se le envía el correo de recuperación si lo pide desde el inicio de sesión).
                  La app no guarda contraseñas.
                </p>
              </div>
              <div>
                <Label>Rol</Label>
                <Select value={editingUser.role} onValueChange={(value: 'admin' | 'empleado') => setEditingUser({ ...editingUser, role: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="empleado">Empleado</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={guardarEdicionUsuario} className="w-full">Guardar Cambios</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={usuarioAEliminar !== null} onOpenChange={(open) => { if (!open) setUsuarioAEliminar(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-red-600">Eliminar al Empleado</DialogTitle>
          </DialogHeader>
          {usuarioAEliminar && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-red-800">{usuarioAEliminar.name}</p>
                <p className="text-sm text-red-700">{usuarioAEliminar.email}</p>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">
                El empleado quedará <span className="font-semibold text-slate-700">bloqueado y dejará de ver el sistema</span>.
                Para quitarle el acceso por completo, bórralo también en
                <span className="font-semibold text-slate-700"> Supabase → Authentication → Users</span>.
              </p>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setUsuarioAEliminar(null)}>Cancelar</Button>
                <Button
                  variant="destructive"
                  onClick={() => eliminarUsuario(usuarioAEliminar.id)}
                >
                  Eliminar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={viewUser !== null} onOpenChange={(open) => { if (!open) setViewUser(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Información del Usuario</DialogTitle>
          </DialogHeader>
          {viewUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border">
                <div className="w-14 h-14 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xl flex-shrink-0 shadow-md">
                  {viewUser.name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 truncate">{viewUser.name}</p>
                  <Badge variant={viewUser.role === 'admin' ? "default" : "secondary"} className="mt-1 text-[10px] capitalize">
                    {viewUser.role === 'admin' ? 'Administrador' : 'Empleado'}
                  </Badge>
                </div>
              </div>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-600">Correo Electrónico</p>
                    <p className="font-medium text-gray-900 break-all">{viewUser.email || '-'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Fecha de creación</p>
                    <p className="font-medium text-gray-900">
                      {viewUser.createdAt ? new Date(viewUser.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                    </p>
                  </div>
                </div>
              </div>
              <Button className="w-full" onClick={() => setViewUser(null)}>Cerrar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal para agregar peso */}
      <Dialog open={isWeightModalOpen} onOpenChange={setIsWeightModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Agregar Peso</DialogTitle>
          </DialogHeader>
          {selectedWeightProduct && (
            <div className="space-y-4">
              {selectedWeightProduct.imageUrl ? (
                <div className="rounded-lg overflow-hidden border bg-slate-50 flex items-center justify-center">
                  <img src={selectedWeightProduct.imageUrl} alt={selectedWeightProduct.name} className="w-full h-40 object-contain" />
                </div>
              ) : (
                <div className="rounded-lg h-24 bg-slate-100 border flex items-center justify-center">
                  <Package className="w-10 h-10 text-slate-300" />
                </div>
              )}
              <div className="flex items-center justify-between bg-slate-50 rounded-lg p-3 border">
                <div>
                  <h3 className="font-bold text-base">{selectedWeightProduct.name}</h3>
                  <p className="text-xs text-gray-500">Stock: {formatWeight(selectedWeightProduct.stock)}</p>
                </div>
                <div className="text-right">
                  <p className="text-green-600 font-bold text-sm">S/ {((selectedWeightProduct.salePricePerKg || 0) / 1000).toFixed(3)} / g</p>
                  <p className="text-blue-600 font-bold text-xs">S/ {(selectedWeightProduct.salePricePerKg || 0).toFixed(2)} / kg</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { grams: 250, label: "250 g", kgLabel: "1/4 kg" },
                    { grams: 500, label: "500 g", kgLabel: "1/2 kg" },
                    { grams: 1000, label: "1000 g", kgLabel: "1 kg" }
                  ].map((item) => (
                    <div key={item.grams} className="text-center">
                      <p className="text-xs font-bold text-gray-700 mb-1">{item.kgLabel}</p>
                      <Button
                        variant="outline"
                        className="w-full mb-2 text-xs"
                        onClick={() => handleWeightQuantityChange(item.grams.toString(), (weightQuantities[item.grams.toString()] || 0) + 1)}
                      >
                        {item.label}
                      </Button>
                      <div className="flex items-center justify-center space-x-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleWeightQuantityChange(item.grams.toString(), Math.max(0, (weightQuantities[item.grams.toString()] || 0) - 1))}
                        >
                          -
                        </Button>
                        <span className="text-sm font-medium">{weightQuantities[item.grams.toString()] || 0}</span>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleWeightQuantityChange(item.grams.toString(), 0)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label htmlFor={weightInputMode === 'grams' ? 'customWeight' : 'customMoney'}>
                      {weightInputMode === 'grams' ? 'O ingresa peso manualmente' : 'O ingresa valor de la venta'}
                    </Label>
                    <div className="flex space-x-1 bg-slate-100 p-0.5 rounded-md border text-xs">
                      <Button
                        type="button"
                        variant={weightInputMode === 'grams' ? 'default' : 'ghost'}
                        className={`h-6 px-2 text-[10px] rounded-sm font-semibold ${weightInputMode === 'grams' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-600 hover:bg-gray-200'}`}
                        onClick={() => {
                          setWeightInputMode('grams');
                          setCustomMoney('');
                        }}
                      >
                        En Gramos
                      </Button>
                      <Button
                        type="button"
                        variant={weightInputMode === 'money' ? 'default' : 'ghost'}
                        className={`h-6 px-2 text-[10px] rounded-sm font-semibold ${weightInputMode === 'money' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-600 hover:bg-gray-200'}`}
                        onClick={() => {
                          setWeightInputMode('money');
                          setCustomWeight('');
                        }}
                      >
                        En Soles
                      </Button>
                    </div>
                  </div>

                  {weightInputMode === 'grams' ? (
                    <Input
                      type="text"
                      placeholder="ej. 350 gramos"
                      id="customWeight"
                      value={customWeight === '0' && !document.activeElement?.id?.includes('customWeight') ? '' : customWeight}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || /^[0-9]*[.]?[0-9]*$/.test(value)) {
                          setCustomWeight(value === '' ? '' : value);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (!/[0-9.]/.test(e.key) && 
                            !['Backspace', 'Delete', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                          e.preventDefault();
                        }
                      }}
                    />
                  ) : (
                    <div className="space-y-1.5">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold text-sm">S/</span>
                        <Input
                          type="text"
                          placeholder="ej. 5.00"
                          id="customMoney"
                          className="pl-8"
                          value={customMoney}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === '' || /^[0-9]*[.]?[0-9]*$/.test(value)) {
                              setCustomMoney(value === '' ? '' : value);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (!/[0-9.]/.test(e.key) && 
                                !['Backspace', 'Delete', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                              e.preventDefault();
                            }
                          }}
                        />
                      </div>
                      {customMoney && parseFloat(customMoney) > 0 && (
                        <p className="text-xs text-blue-600 font-semibold mt-1">
                          Equivale a: {(() => {
                            const pricePerKg = selectedWeightProduct.salePricePerKg || 0;
                            const equiv = pricePerKg > 0 ? Math.round((parseFloat(customMoney) * 1000) / pricePerKg) : 0;
                            return formatWeight(equiv);
                          })()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="flex justify-between">
                    <span>Peso Total:</span>
                    <span className="font-bold">
                      {(() => {
                        let total = 0;
                        Object.entries(weightQuantities).forEach(([weight, quantity]) => {
                          total += parseInt(weight) * quantity;
                        });
                        if (weightInputMode === 'grams') {
                          if (customWeight && parseFloat(customWeight) > 0) {
                            total += parseFloat(customWeight);
                          }
                        } else {
                          if (customMoney && parseFloat(customMoney) > 0) {
                            const pricePerKg = selectedWeightProduct.salePricePerKg || 0;
                            total += pricePerKg > 0 ? Math.round((parseFloat(customMoney) * 1000) / pricePerKg) : 0;
                          }
                        }
                        return formatWeight(total);
                      })()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Precio Total:</span>
                    <span className="font-bold text-green-600">
                      S/ {(() => {
                        let totalWeight = 0;
                        Object.entries(weightQuantities).forEach(([weight, quantity]) => {
                          totalWeight += parseInt(weight) * quantity;
                        });
                        if (weightInputMode === 'grams') {
                          if (customWeight && parseFloat(customWeight) > 0) {
                            totalWeight += parseFloat(customWeight);
                          }
                        } else {
                          if (customMoney && parseFloat(customMoney) > 0) {
                            const pricePerKg = selectedWeightProduct.salePricePerKg || 0;
                            totalWeight += pricePerKg > 0 ? Math.round((parseFloat(customMoney) * 1000) / pricePerKg) : 0;
                          }
                        }
                        return ((selectedWeightProduct.salePricePerKg || 0) * (totalWeight / 1000)).toFixed(2);
                      })()}
                    </span>
                  </div>
                </div>
              </div>
              
              <Button onClick={handleAddWeightToCart} className="w-full bg-green-600 hover:bg-green-700">
                Agregar al Carrito
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal para venta mayorista */}
      <Dialog open={isMayoristaModalOpen} onOpenChange={setIsMayoristaModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedMayoristaProduct?.saleLevels?.some(l => l.name === 'Unidad') ? 'Seleccionar Venta' : 'Venta Mayorista'}</DialogTitle>
          </DialogHeader>
          {selectedMayoristaProduct && (
            <div className="space-y-4">
              {selectedMayoristaProduct.imageUrl ? (
                <div className="rounded-lg overflow-hidden border bg-slate-50 flex items-center justify-center">
                  <img src={selectedMayoristaProduct.imageUrl} alt={selectedMayoristaProduct.name} className="w-full h-40 object-contain" />
                </div>
              ) : (
                <div className="rounded-lg h-24 bg-slate-100 border flex items-center justify-center">
                  <Package className="w-10 h-10 text-slate-300" />
                </div>
              )}
              <div className="flex items-center justify-between bg-slate-50 rounded-lg p-3 border">
                <div>
                  <h3 className="font-bold text-base">{selectedMayoristaProduct.name}</h3>
                </div>
                <p className="text-xs text-gray-500">
                  {selectedMayoristaProduct.type === 'mayorista'
                    ? 'Stock disponible por niveles'
                    : `Stock: ${selectedMayoristaProduct.stock} unid.`}
                </p>
              </div>

              <div className="space-y-3">
                <Label>Nivel de Venta</Label>
                <div className="grid gap-2">
                  {selectedMayoristaProduct.saleLevels?.map((level) => {
                    const isUnidadBased = selectedMayoristaProduct.saleLevels?.some(l => l.name === 'Unidad');
                    const stockBase = isUnidadBased
                      ? (selectedMayoristaProduct.saleLevels?.find(l => l.name === 'Unidad')?.stock ?? 0)
                      : selectedMayoristaProduct.stock;
                    const availableStock = isUnidadBased
                      ? Math.floor(stockBase / level.baseUnitsContained)
                      : level.stock;
                    const hasStock = isUnidadBased
                      ? stockBase >= level.baseUnitsContained
                      : level.stock > 0;
                    return (
                    <div
                      key={level.id}
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        !hasStock ? 'opacity-50 cursor-not-allowed' :
                        selectedLevelId === level.id
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                      onClick={() => {
                        if (!hasStock) return;
                        setSelectedLevelId(level.id);
                        setMayoristaQuantity(1);
                      }}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm">{level.name}</p>
                            {!hasStock && (
                              <Badge variant="secondary" className="text-[9px] bg-red-100 text-red-700 border-red-200">
                                Sin stock
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">
                            {level.name === 'Unidad' ? '1 unid.' : `Contiene: ${level.baseUnitsContained} unid.`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-600">S/ {(level.salePrice ?? 0).toFixed(2)}</p>
                          {level.name === 'Unidad' ? (
                            <p className="text-sm text-indigo-600 font-semibold">Stock: {stockBase} unid.</p>
                          ) : (
                            <p className="text-sm text-indigo-600 font-semibold">Stock: {availableStock} {level.name}(s)</p>
                          )}
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>

              {selectedLevelId && (() => {
                const selectedLevel = selectedMayoristaProduct.saleLevels?.find(l => l.id === selectedLevelId);
                if (!selectedLevel) return null;
                const isUnidadBased = selectedMayoristaProduct.saleLevels?.some(l => l.name === 'Unidad');
                const stockBase = isUnidadBased
                  ? (selectedMayoristaProduct.saleLevels?.find(l => l.name === 'Unidad')?.stock ?? 0)
                  : selectedMayoristaProduct.stock;
                const maxLevels = isUnidadBased
                  ? Math.floor(stockBase / selectedLevel.baseUnitsContained)
                  : selectedLevel.stock;
                return (
                  <div className="space-y-3">
                    <div>
                      <Label>Cantidad ({selectedLevel.name}(s))</Label>
                      <div className="flex items-center space-x-3 mt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 w-9"
                          onClick={() => {
                            const currentVal = typeof mayoristaQuantity === 'number' ? mayoristaQuantity : (parseInt(mayoristaQuantity) || 1);
                            setMayoristaQuantity(Math.max(1, currentVal - 1));
                          }}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <Input
                          type="number"
                          min="1"
                          max={maxLevels}
                          value={mayoristaQuantity}
                          onChange={(e) => {
                            if (e.target.value === '') {
                              setMayoristaQuantity('');
                              return;
                            }
                            let val = parseInt(e.target.value);
                            if (isNaN(val)) return;
                            if (val < 1) val = 1;
                            if (val > maxLevels) val = maxLevels;
                            setMayoristaQuantity(val);
                          }}
                          onBlur={(e) => {
                            let val = parseInt(e.target.value);
                            if (isNaN(val) || val < 1) val = 1;
                            if (val > maxLevels) val = maxLevels;
                            setMayoristaQuantity(val);
                          }}
                          className="text-center h-9 w-20"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 w-9"
                          onClick={() => {
                            const currentVal = typeof mayoristaQuantity === 'number' ? mayoristaQuantity : (parseInt(mayoristaQuantity) || 1);
                            setMayoristaQuantity(Math.min(maxLevels, currentVal + 1));
                          }}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Máx: {maxLevels} {selectedLevel.name}(s)</p>
                    </div>

                    <Separator />

                    <div className="bg-gray-50 p-3 rounded-lg space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>Precio por {selectedLevel.name}:</span>
                        <span className="font-semibold">S/ {(selectedLevel.salePrice ?? 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Cantidad:</span>
                        <span className="font-semibold">
                          {typeof mayoristaQuantity === 'number' ? mayoristaQuantity : (parseInt(mayoristaQuantity) || 0)} {selectedLevel.name}(s)
                        </span>
                      </div>
                      <Separator />
                      <div className="flex justify-between text-lg font-bold">
                        <span>Total:</span>
                        <span className="text-green-600">
                          S/ {(selectedLevel.salePrice * (typeof mayoristaQuantity === 'number' ? mayoristaQuantity : (parseInt(mayoristaQuantity) || 0))).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <Button
                      onClick={handleAddMayoristaToCart}
                      className="w-full bg-indigo-600 hover:bg-indigo-700"
                    >
                      Agregar al Carrito
                    </Button>
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal para editar producto de peso */}
      <Dialog open={isEditWeightProductOpen} onOpenChange={setIsEditWeightProductOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Producto por Peso</DialogTitle>
          </DialogHeader>
          {editingWeightProduct && (
            <div className="space-y-4">
              <div>
                <Label>Nombre</Label>
                <Input 
                  placeholder="Ej: Queso Fresco" 
                  value={editingWeightProduct.name} 
                  onChange={(e) => setEditingWeightProduct({...editingWeightProduct, name: e.target.value})} 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="block min-h-[20px]">Precio de Compra por Kilo</Label>
                  <Input 
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={editPurchasePerKgInput} 
                    onChange={(e) => {
                      const raw = e.target.value;
                      const normalized = raw.replace(',', '.');
                      if (raw === '' || /^\d*(?:[.,]\d{0,2})?$/.test(raw)) {
                        setEditPurchasePerKgInput(raw);
                        const num = normalized === '' ? 0 : parseFloat(normalized) || 0;
                        setEditingWeightProduct({...editingWeightProduct, purchasePrice: num, purchasePricePerKg: num});
                      }
                    }}
                    onBlur={(e) => {
                      const v = e.target.value.replace(',', '.');
                      if (v !== '' && !isNaN(Number(v))) {
                        const n = Math.round(parseFloat(v) * 100) / 100;
                        setEditingWeightProduct({ ...editingWeightProduct, purchasePrice: n, purchasePricePerKg: n });
                        setEditPurchasePerKgInput(n.toFixed(2));
                      } else {
                        setEditPurchasePerKgInput('');
                      }
                    }}
                  />
                </div>
                <div>
                  <Label className="block min-h-[20px]">Precio de Venta por Kilo</Label>
                  <Input 
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={editSalePerKgInput} 
                    onChange={(e) => {
                      const raw = e.target.value;
                      const normalized = raw.replace(',', '.');
                      if (raw === '' || /^\d*(?:[.,]\d{0,2})?$/.test(raw)) {
                        setEditSalePerKgInput(raw);
                        const num = normalized === '' ? 0 : parseFloat(normalized) || 0;
                        setEditingWeightProduct({...editingWeightProduct, salePrice: num, salePricePerKg: num});
                      }
                    }}
                    onBlur={(e) => {
                      const v = e.target.value.replace(',', '.');
                      if (v !== '' && !isNaN(Number(v))) {
                        const n = Math.round(parseFloat(v) * 100) / 100;
                        setEditingWeightProduct({ ...editingWeightProduct, salePrice: n, salePricePerKg: n });
                        setEditSalePerKgInput(n.toFixed(2));
                      } else {
                        setEditSalePerKgInput('');
                      }
                    }}
                  />
                </div>
              </div>
              <div className={`text-sm text-green-600 font-medium ${pricePulse ? 'animate-pulse' : ''}`}>
                Precio de Venta por Gramo: S/ {((editingWeightProduct.salePrice || 0) / 1000).toFixed(3)}
              </div>
                <div>
                <Label>Equivale por gramo</Label>
                <Input 
                  type="number"
                  step="0.001"
                  inputMode="decimal"
                  placeholder="0.020"
                  value={editingWeightProduct.equivalentGrams ?? ''}
                  onChange={(e) => {
                    const v = e.target.value.replace(',', '.');
                    if (v === '' || /^\d*(?:[.,]\d{0,3})?$/.test(v)) {
                      setEditingWeightProduct({
                        ...editingWeightProduct,
                        equivalentGrams: v === '' ? 0 : parseFloat(v) || 0
                      });
                    }
                  }}
                  onBlur={(e) => {
                    const v = e.target.value.replace(',', '.');
                    if (v !== '') {
                      const n = Math.round((parseFloat(v) || 0) * 1000) / 1000;
                      setEditingWeightProduct({ ...editingWeightProduct, equivalentGrams: n });
                    }
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                {(() => {
                  const hasSales = stockHistory.some(h => h.productId === editingWeightProduct.id && h.type === 'sale');
                  return (
                    <>
                      <div>
                        <Label>Stock actual (g)</Label>
                        <Input 
                          type="text" 
                          placeholder="9000" 
                          value={editingWeightProduct.stock || ''} 
                          onChange={(e) => {
                            if (hasSales) return;
                            const value = e.target.value;
                            if (value === '' || /^\d+$/.test(value)) {
                              setEditingWeightProduct({...editingWeightProduct, stock: value === '' ? 0 : parseInt(value) || 0});
                            }
                          }}
                          className={hasSales ? 'opacity-60 cursor-not-allowed' : ''}
                          disabled={hasSales}
                        />
                      </div>
                      <div className="flex items-end">
                        {hasSales ? (
                          <p className="text-[10px] text-amber-600 font-medium w-full">⚠️ Stock bloqueado. Usa <strong>"Restock"</strong> en Historial.</p>
                        ) : (
                          <div className="p-2 bg-green-100 text-green-800 rounded-md text-center w-full">
                            <p className="text-xs">Conversión</p>
                            <p className="font-bold">{formatWeight(editingWeightProduct.stock)}</p>
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
              <div>
                <Label>Peso mínimo (g)</Label>
                <Input 
                  type="text" 
                  placeholder="10" 
                  id="editMinWeightGrams"
                  value={editingWeightProduct.minWeightGrams === 0 && !document.activeElement?.id?.includes('editMinWeightGrams') ? '' : (editingWeightProduct.minWeightGrams || '').toString()} 
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^[0-9]*$/.test(value)) {
                      setEditingWeightProduct({...editingWeightProduct, minWeightGrams: value === '' ? 0 : parseInt(value)});
                    }
                  }}
                  onKeyDown={(e) => {
                    if (!/\d/.test(e.key) && 
                        !['Backspace', 'Delete', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                      e.preventDefault();
                    }
                  }} 
                />
              </div>
              <div>
                <Label>Categoría</Label>
                <Input 
                  placeholder="Ej: Especias" 
                  value={editingWeightProduct.category} 
                  onChange={(e) => setEditingWeightProduct({...editingWeightProduct, category: e.target.value})} 
                />
              </div>
              <Separator />
              <div>
                <Label>Imagen del producto</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setEditProductImage(file);
                      const reader = new FileReader();
                      reader.onloadend = () => setEditProductImagePreview(reader.result as string);
                      reader.readAsDataURL(file);
                    }
                  }}
                />
                <div className="mt-3">
                  {editProductImagePreview ? (
                    <img src={editProductImagePreview} alt="Preview" className="w-full h-40 object-cover rounded-lg border" />
                  ) : editingWeightProduct.imageUrl ? (
                    <div className="relative">
                      <img src={editingWeightProduct.imageUrl} alt={editingWeightProduct.name} className="w-full h-40 object-cover rounded-lg border" />
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-6 w-6 rounded-full"
                        onClick={() => {
                          setEditingWeightProduct({ ...editingWeightProduct, imageUrl: undefined });
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="w-full h-32 bg-slate-100 rounded-lg border flex items-center justify-center">
                      <Package className="w-8 h-8 text-slate-300" />
                    </div>
                  )}
                </div>
              </div>
              <Button onClick={guardarEdicionProductoPeso} className="w-full bg-green-600 hover:bg-green-700">
                Guardar Cambios
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal para editar producto mayorista */}
      <Dialog open={isEditMayoristaOpen} onOpenChange={setIsEditMayoristaOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Editar Producto Mayorista</DialogTitle>
          </DialogHeader>
          {editingMayoristaProduct && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Column 1: Basic Info */}
                <div className="space-y-4">
                  <div>
                    <Label>Nombre del Producto</Label>
                    <Input
                      value={editMayoristaName}
                      onChange={(e) => setEditMayoristaName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Categoría</Label>
                    <Input
                      value={editMayoristaCategory}
                      onChange={(e) => setEditMayoristaCategory(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Imagen del producto</Label>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setEditProductImage(file);
                          const reader = new FileReader();
                          reader.onloadend = () => setEditProductImagePreview(reader.result as string);
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    <div className="mt-3">
                      {editProductImagePreview ? (
                        <img src={editProductImagePreview} alt="Preview" className="w-full h-40 object-cover rounded-lg border" />
                      ) : editingMayoristaProduct.imageUrl ? (
                        <div className="relative">
                          <img src={editingMayoristaProduct.imageUrl} alt={editingMayoristaProduct.name} className="w-full h-40 object-cover rounded-lg border" />
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute top-2 right-2 h-6 w-6 rounded-full"
                            onClick={() => {
                              setEditingMayoristaProduct({ ...editingMayoristaProduct, imageUrl: undefined });
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="w-full h-40 bg-slate-100 rounded-lg border flex items-center justify-center">
                          <Package className="w-8 h-8 text-slate-300" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Column 2: Levels */}
                <div className="space-y-4">
                  <div className="border p-4 rounded-xl space-y-4 bg-white shadow-sm">
                    <h4 className="font-semibold text-sm text-slate-700">Niveles de Venta</h4>
                    {editMayoristaLevels.length > 0 ? (
                      <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                        {editMayoristaLevels.map((lvl) => {
                          const hasUnidad = editMayoristaLevels.some(l => l.name === 'Unidad');
                          const isStockEditable = lvl.name === 'Unidad' || !hasUnidad;
                          const hasSales = stockHistory.some(h => h.productId === editingMayoristaProduct?.id && h.type === 'sale');
                          return (
                          <div key={lvl.id} className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
                            {editingLevelId === lvl.id ? (
                              <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                  <p className="font-semibold text-slate-800">{lvl.name}</p>
                                  <div className="flex gap-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-green-600 hover:text-green-800 hover:bg-green-50"
                                      onClick={() => {
                                        const newStock = isStockEditable ? parseInt(editLevelTempStock) : lvl.stock;
                                        const newSP = parseFloat(editLevelTempSalePrice);
                                        const newPP = parseFloat(editLevelTempPurchasePrice);
                                        if ((isStockEditable && (isNaN(newStock) || newStock < 0)) || isNaN(newSP) || newSP < 0 || isNaN(newPP) || newPP < 0) {
                                          toast({ title: "Valores no válidos", variant: "destructive" });
                                          return;
                                        }
                                        if (newPP >= newSP) {
                                          toast({ title: "Precios inválidos", description: "El precio de compra debe ser menor al precio de venta", variant: "destructive" });
                                          return;
                                        }
                                        const oldSP = lvl.salePrice;
                                        const oldPP = lvl.purchasePrice;
                                        const priceChanged = oldSP !== newSP || oldPP !== newPP;
                                        if (priceChanged) {
                                          const priceChangeEntry: StockHistoryItem = {
                                            id: generateId(),
                                            productId: editingMayoristaProduct!.id,
                                            productName: editingMayoristaProduct!.name,
                                            type: 'price_change',
                                            quantity: 0,
                                            resultingStock: 0,
                                            date: new Date().toISOString(),
                                            priceChanges: [{
                                              levelName: lvl.name,
                                              oldSalePrice: oldSP,
                                              newSalePrice: newSP,
                                              oldPurchasePrice: oldPP,
                                              newPurchasePrice: newPP
                                            }]
                                          };
                                          const updatedHistory = [...stockHistory, priceChangeEntry];
                                          setStockHistory(updatedHistory);
                                          safeSetItem('pos-stock-history', JSON.stringify(updatedHistory));
                                          addPendingId(PENDING.HISTORY, priceChangeEntry.id);
                                          syncHistoryToFirestore(updatedHistory);
                                        }
                                        setEditMayoristaLevels(editMayoristaLevels.map(l =>
                                          l.id === lvl.id ? { ...l, stock: newStock, salePrice: newSP, purchasePrice: newPP } : l
                                        ));
                                        setEditingLevelId(null);
                                      }}
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    </Button>
                                    {!(lvl.name === 'Unidad') && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50"
                                      onClick={() => setEditMayoristaLevels(editMayoristaLevels.filter(l => l.id !== lvl.id))}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                    )}
                                  </div>
                                </div>
                                <div className={`grid gap-2 ${isStockEditable ? 'grid-cols-3' : 'grid-cols-2'}`}>
                                  {isStockEditable && (
                                  <div>
                                    <Label className="text-[9px] text-slate-500">Stock</Label>
                                    <Input
                                      type="text"
                                      value={editLevelTempStock}
                                      onChange={(e) => {
                                        if (hasSales) return;
                                        const val = e.target.value;
                                        if (val === '' || /^\d*$/.test(val)) setEditLevelTempStock(val);
                                      }}
                                      className={`h-7 text-xs ${hasSales ? 'opacity-60 cursor-not-allowed' : ''}`}
                                      disabled={hasSales}
                                    />
                                  </div>
                                  )}
                                  <div>
                                    <Label className="text-[9px] text-slate-500">P. Venta (S/)</Label>
                                    <Input
                                      type="text"
                                      value={editLevelTempSalePrice}
                                      onChange={(e) => setEditLevelTempSalePrice(e.target.value)}
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-[9px] text-slate-500">P. Compra (S/)</Label>
                                    <Input
                                      type="text"
                                      value={editLevelTempPurchasePrice}
                                      onChange={(e) => setEditLevelTempPurchasePrice(e.target.value)}
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                </div>
                                {hasSales && isStockEditable && (
                                  <p className="text-[9px] text-amber-600 col-span-3">⚠️ Stock bloqueado porque ya se realizaron ventas. Usa <strong>"Restock"</strong> en Historial de Stock.</p>
                                )}
                                <p className="text-[9px] text-slate-400">Contiene: {lvl.baseUnitsContained} unid. por {lvl.name}</p>
                              </div>
                            ) : (
                              <div className="flex justify-between items-center">
                                <div>
                                  <p className="font-semibold text-slate-800">{lvl.name}</p>
                                  {lvl.name === 'Unidad' ? (
                                    <p className="text-[10px] text-slate-500">
                                      Contiene: {lvl.baseUnitsContained} unid. &middot; Stock: {lvl.stock} unid. &middot; S/ {(lvl.salePrice ?? 0).toFixed(2)} (Compra: S/ {(lvl.purchasePrice ?? 0).toFixed(2)})
                                    </p>
                                  ) : hasUnidad ? (
                                    <p className="text-[10px] text-slate-500">
                                      Contiene: {lvl.baseUnitsContained} unid. &middot; S/ {(lvl.salePrice ?? 0).toFixed(2)} (Compra: S/ {(lvl.purchasePrice ?? 0).toFixed(2)})
                                    </p>
                                  ) : (
                                    <p className="text-[10px] text-slate-500">
                                      Contiene: {lvl.baseUnitsContained} unid. &middot; Stock: {lvl.stock} {lvl.name}(s) &middot; S/ {(lvl.salePrice ?? 0).toFixed(2)} (Compra: S/ {(lvl.purchasePrice ?? 0).toFixed(2)})
                                    </p>
                                  )}
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                                    onClick={() => {
                                      setEditingLevelId(lvl.id);
                                      setEditLevelTempStock(String(lvl.stock));
                                      setEditLevelTempSalePrice(String((lvl.salePrice ?? 0).toFixed(2)));
                                      setEditLevelTempPurchasePrice(String((lvl.purchasePrice ?? 0).toFixed(2)));
                                    }}
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                  </Button>
                                    {!(lvl.name === 'Unidad') && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50"
                                      onClick={() => setEditMayoristaLevels(editMayoristaLevels.filter(l => l.id !== lvl.id))}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                    )}
                                 </div>
                               </div>
                             )}
                           </div>
                           );
                         })}
                       </div>
                     ) : (
                       <p className="text-xs text-slate-400 italic">No hay niveles. Agrega al menos uno.</p>
                    )}

                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2.5">
                      <p className="text-xs font-semibold text-slate-700">Agregar Nivel</p>
                      <div>
                        <Label className="text-[10px]">Seleccionar Nivel</Label>
                        <Select value={editLevelDropdown} onValueChange={setEditLevelDropdown}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Elige un nivel..." />
                          </SelectTrigger>
                          <SelectContent>
                            {['Unidad', 'Paquete', 'Ciento', 'Millar', 'Plancha', 'Fardo', 'Personalizado'].filter(n => !editMayoristaLevels.find(l => l.name === n) && (n !== 'Unidad' || editingMayoristaProduct?.type !== 'mayorista')).map(n => (
                              <SelectItem key={n} value={n}>{n}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {editLevelDropdown === 'Personalizado' && (
                          <Input
                            type="text"
                            placeholder="Nombre del nivel..."
                            value={editLevelCustomName}
                            onChange={(e) => setEditLevelCustomName(e.target.value)}
                            className="h-8 text-xs mt-2"
                          />
                        )}
                      </div>
                      {editLevelDropdown && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px]">Contenido (unid.)</Label>
                            <Input
                              type="text"
                              placeholder="Ej: 25"
                              value={editLevelDropdown === 'Unidad' ? '1' : editLevelContains}
                              onChange={(e) => setEditLevelContains(e.target.value)}
                              className="h-8 text-xs"
                              disabled={editLevelDropdown === 'Unidad'}
                            />
                          </div>
                          {!editMayoristaLevels.some(l => l.name === 'Unidad') && (
                          <div>
                            <Label className="text-[10px]">Stock {editLevelDropdown !== 'Personalizado' ? `(${editLevelDropdown}s)` : ''}</Label>
                            <Input
                              type="text"
                              placeholder="0"
                              value={editLevelStockInput}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '' || /^\d*$/.test(val)) {
                                  setEditLevelStockInput(val);
                                }
                              }}
                              className="h-8 text-xs"
                            />
                          </div>
                          )}
                          <div>
                            <Label className="text-[10px]">P. Compra (S/)</Label>
                            <Input
                              type="text"
                              placeholder="0.00"
                              value={editLevelPurchasePrice}
                              onChange={(e) => setEditLevelPurchasePrice(e.target.value)}
                              className="h-8 text-xs"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px]">P. Venta (S/)</Label>
                            <Input
                              type="text"
                              placeholder="0.00"
                              value={editLevelSalePrice}
                              onChange={(e) => setEditLevelSalePrice(e.target.value)}
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="col-span-2 flex items-end pt-1">
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full h-8 text-xs bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                              disabled={
                                editLevelDropdown === 'Unidad'
                                  ? (!editLevelPurchasePrice || !editLevelSalePrice || !editLevelStockInput)
                                  : editMayoristaLevels.some(l => l.name === 'Unidad')
                                    ? (!editLevelContains || !editLevelPurchasePrice || !editLevelSalePrice)
                                    : (!editLevelContains || !editLevelPurchasePrice || !editLevelSalePrice || !editLevelStockInput)
                              }
                              onClick={() => {
                                const isUnidad = editLevelDropdown === 'Unidad';
                                const contains = isUnidad ? 1 : parseInt(editLevelContains);
                                if (!isUnidad && (isNaN(contains) || contains <= 0)) {
                                  toast({ title: "Contenido no válido", description: "Debe ser mayor a 0", variant: "destructive" });
                                  return;
                                }

                                const pPrice = parseFloat(editLevelPurchasePrice);
                                const sPrice = parseFloat(editLevelSalePrice);
                                const hasUnidad = editMayoristaLevels.some(l => l.name === 'Unidad');
                                const stockQty = (isUnidad || !hasUnidad) ? parseInt(editLevelStockInput || '0') : 0;
                                if (isNaN(pPrice) || pPrice < 0 || isNaN(sPrice) || sPrice < 0) {
                                  toast({ title: "Precios no válidos", description: "Ingresa precios mayores o iguales a 0", variant: "destructive" });
                                  return;
                                }
                                if (pPrice >= sPrice) {
                                  toast({ title: "Precios inválidos", description: "El precio de compra debe ser menor al precio de venta", variant: "destructive" });
                                  return;
                                }
                                if ((isUnidad || !hasUnidad) && (isNaN(stockQty) || stockQty < 0)) {
                                  toast({ title: "Stock no válido", description: "Ingresa un stock válido", variant: "destructive" });
                                  return;
                                }
                                const newLvl: SaleLevel = {
      id: generateId(),
                                  name: editLevelDropdown === 'Personalizado' ? editLevelCustomName.trim() : editLevelDropdown,
                                  baseUnitsContained: contains,
                                  purchasePrice: pPrice,
                                  salePrice: sPrice,
                                  stock: isUnidad ? stockQty : (editMayoristaLevels.some(l => l.name === 'Unidad') ? 0 : stockQty),
                                  initialStock: isUnidad ? stockQty : (editMayoristaLevels.some(l => l.name === 'Unidad') ? 0 : stockQty)
                                };
                                setEditMayoristaLevels([...editMayoristaLevels, newLvl]);
                                setEditLevelDropdown('');
                                setEditLevelCustomName('');
                                setEditLevelContains('');
                                setEditLevelPurchasePrice('');
                                setEditLevelSalePrice('');
                                setEditLevelStockInput('');
                              }}
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Agregar Nivel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>


                </div>
              </div>

              <Button
                onClick={guardarEdicionMayorista}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-11 text-base shadow-md"
                disabled={!editMayoristaName.trim() || !editMayoristaCategory.trim() || editMayoristaLevels.length === 0}
              >
                Guardar Cambios
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de confirmación para eliminar productos */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Eliminación</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que quieres eliminar los siguientes productos? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {productsToDelete.map((product) => (
              <div key={product.id} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-red-900">{product.name}</p>
                    <p className="text-sm text-red-700">Stock: {product.stock}</p>
                    <p className="text-sm text-red-700">Categoría: {product.category}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={deleteSelectedProducts}>
              Eliminar Productos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de edición rápida de productos */}
      <Dialog open={isEditQuickProductOpen} onOpenChange={setIsEditQuickProductOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Producto</DialogTitle>
          </DialogHeader>
          {editingQuickProduct && (
            <div className="space-y-4">
              <div>
                <Label>Nombre del Producto</Label>
                <Input 
                  placeholder="Ej: Coca Cola 600ml"
                  value={editingQuickProduct.name}
                  onChange={(e) => setEditingQuickProduct({...editingQuickProduct, name: e.target.value})}
                />
              </div>
              <div>
                <Label>Categoría</Label>
                <Input 
                  placeholder="Ej: Bebidas"
                  value={editingQuickProduct.category}
                  onChange={(e) => setEditingQuickProduct({...editingQuickProduct, category: e.target.value})}
                />
                {getFrequentCategories.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-2">Categorías frecuentes:</p>
                    <div className="flex flex-wrap gap-2">
                      {getFrequentCategories.map((category) => (
                        <button
                          key={category}
                          type="button"
                          onClick={() => setEditingQuickProduct({...editingQuickProduct, category})}
                          className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
                        >
                          {category}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <Label>Stock</Label>
                <Input 
                  type="text"
                  placeholder="0"
                  value={editingQuickProduct.stock || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^\d+$/.test(value)) {
                      setEditingQuickProduct({...editingQuickProduct, stock: value === '' ? 0 : parseInt(value) || 0});
                    }
                  }}
                />
              </div>
              <Button onClick={saveQuickEdit} className="w-full">
                Guardar Cambios
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de confirmación para eliminar cierre de caja */}
      <Dialog open={isDeleteCloseOpen} onOpenChange={setIsDeleteCloseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">⚠️ Confirmar Eliminación Permanente</DialogTitle>
            <DialogDescription>
              Estás a punto de eliminar permanentemente el cierre de caja del{' '}
              <strong>{closeToDelete ? formatearFechaLocal(closeToDelete.date) : ''}</strong>.
              <br /><br />
              <span className="text-red-600 font-medium">
                ⚠️ Esta acción NO se puede deshacer y eliminará completamente todos los datos de este cierre.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {closeToDelete && (
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <h4 className="font-medium text-red-900 mb-2">Resumen del cierre a eliminar:</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p><span className="font-medium">Total Vendido:</span> S/ {closeToDelete.totalSales.toFixed(2)}</p>
                    <p><span className="font-medium">Ganancias:</span> S/ {closeToDelete.totalProfit.toFixed(2)}</p>
                  </div>
                  <div>
                    <p><span className="font-medium">Productos:</span> {closeToDelete.totalItems}</p>
                    <p><span className="font-medium">Ventas:</span> {closeToDelete.salesCount}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteCloseOpen(false)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDeleteDailyClose}
              disabled={!adminPassword.trim()}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Eliminar Permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Ver Producto Mayorista */}
      <Dialog open={isViewMayoristaProductOpen} onOpenChange={setIsViewMayoristaProductOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Información de producto
            </DialogTitle>
            {viewingMayoristaProduct && (
              <p className="text-base font-bold text-slate-900 mt-3 pt-3 border-t border-slate-100">
                {viewingMayoristaProduct.name}
              </p>
            )}
          </DialogHeader>
          {viewingMayoristaProduct && (() => {
            const sortedLevels = [...(viewingMayoristaProduct.saleLevels || [])].sort((a, b) => { if (a.name === 'Unidad') return -1; if (b.name === 'Unidad') return 1; return a.baseUnitsContained - b.baseUnitsContained; });
            const colors = [
              { border: 'border-blue-300', bgAccent: 'bg-blue-50', headerBg: 'bg-blue-100', profitBg: 'bg-blue-600' },
              { border: 'border-green-300', bgAccent: 'bg-green-50', headerBg: 'bg-green-100', profitBg: 'bg-green-700' },
              { border: 'border-purple-300', bgAccent: 'bg-purple-50', headerBg: 'bg-purple-100', profitBg: 'bg-purple-700' },
              { border: 'border-orange-300', bgAccent: 'bg-orange-50', headerBg: 'bg-orange-100', profitBg: 'bg-orange-600' },
              { border: 'border-pink-300', bgAccent: 'bg-pink-50', headerBg: 'bg-pink-100', profitBg: 'bg-pink-600' },
            ];
            const hasUnidad = viewingMayoristaProduct.saleLevels?.some(l => l.name === 'Unidad');
            const unidadLevel = hasUnidad ? sortedLevels.find(l => l.name === 'Unidad') : null;
            return (
              <div className="space-y-8">
                {/* Row 1: Image + Estado de Inventario card (hasUnidad) or full levels grid (!hasUnidad) */}
                <div className="flex flex-col md:flex-row gap-8 items-start">
                  <div className="flex-shrink-0 flex flex-col items-center">
                    {viewingMayoristaProduct.imageUrl ? (
                      <img 
                        src={viewingMayoristaProduct.imageUrl} 
                        alt={viewingMayoristaProduct.name} 
                        className="w-48 h-48 object-cover rounded-xl border border-slate-200" 
                      />
                    ) : (
                      <div className="w-48 h-48 bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-center">
                        <Package className="w-12 h-12 text-slate-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 w-full">
                    {hasUnidad ? (
                      unidadLevel && (
                        <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-lg">
                          <div className="bg-slate-100 px-4 py-3 border-b border-slate-300">
                            <div className="flex justify-between items-center">
                              <h4 className="text-lg font-bold text-slate-800">Estado de Inventario</h4>
                            </div>
                          </div>
                          <div className="p-4">
                            <div className="grid grid-cols-2 gap-3 bg-white p-3 rounded-lg border border-slate-200">
                              <div className="space-y-1">
                                <p className="text-xs font-semibold text-slate-500 uppercase">STOCK INICIAL</p>
                                <p className="text-xl font-bold text-slate-900">{unidadLevel.initialStock}</p>
                                <p className="text-[11px] text-slate-400 font-medium">→ {unidadLevel.initialStock} und</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs font-semibold text-slate-500 uppercase">STOCK ACTUAL</p>
                                <p className="text-xl font-bold text-blue-600">{unidadLevel.stock}</p>
                                <p className="text-[11px] text-slate-400 font-medium">→ {unidadLevel.stock} und</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    ) : sortedLevels.length === 0 ? (
                      <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-lg">
                        <div className="bg-slate-100 px-4 py-3 border-b border-slate-300">
                          <div className="flex justify-between items-center">
                            <h4 className="text-lg font-bold text-slate-800">Estado de Inventario</h4>
                          </div>
                        </div>
                        <div className="p-4">
                          <div className="grid grid-cols-2 gap-3 bg-white p-3 rounded-lg border border-slate-200">
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-slate-500 uppercase">STOCK INICIAL</p>
                              <p className="text-xl font-bold text-slate-900">{viewingMayoristaProduct.type === 'peso' ? formatWeight(viewingMayoristaProduct.initialStock ?? viewingMayoristaProduct.stock) : `${viewingMayoristaProduct.initialStock ?? viewingMayoristaProduct.stock} und`}</p>
                              <p className="text-[11px] text-slate-400 font-medium">{viewingMayoristaProduct.type === 'peso' ? `${((viewingMayoristaProduct.initialStock ?? viewingMayoristaProduct.stock) / 1000).toFixed(2)} kg` : `→ ${viewingMayoristaProduct.initialStock ?? viewingMayoristaProduct.stock} und`}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-slate-500 uppercase">STOCK ACTUAL</p>
                              <p className="text-xl font-bold text-blue-600">{viewingMayoristaProduct.type === 'peso' ? formatWeight(viewingMayoristaProduct.stock) : `${viewingMayoristaProduct.stock} und`}</p>
                              <p className="text-[11px] text-slate-400 font-medium">{viewingMayoristaProduct.type === 'peso' ? `${(viewingMayoristaProduct.stock / 1000).toFixed(2)} kg` : `→ ${viewingMayoristaProduct.stock} und`}</p>
                            </div>
                          </div>
                          <div className="border-t border-slate-200 my-4"></div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                              <p className="text-xs font-semibold text-blue-700 uppercase mb-1">VALOR COMPRA</p>
                              <p className="text-2xl font-bold text-blue-800">{formatCurrency(viewingMayoristaProduct.type === 'peso' ? (viewingMayoristaProduct.purchasePrice ?? viewingMayoristaProduct.purchasePricePerKg ?? 0) * (viewingMayoristaProduct.initialStock ?? viewingMayoristaProduct.stock) / 1000 : (viewingMayoristaProduct.purchasePrice ?? 0) * (viewingMayoristaProduct.initialStock ?? viewingMayoristaProduct.stock))}</p>
                            </div>
                            <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                              <p className="text-xs font-semibold text-green-700 uppercase mb-1">VALOR VENTA</p>
                              <p className="text-2xl font-bold text-green-800">{formatCurrency(viewingMayoristaProduct.type === 'peso' ? (viewingMayoristaProduct.salePrice ?? viewingMayoristaProduct.salePricePerKg ?? 0) * (viewingMayoristaProduct.initialStock ?? viewingMayoristaProduct.stock) / 1000 : (viewingMayoristaProduct.salePrice ?? 0) * (viewingMayoristaProduct.initialStock ?? viewingMayoristaProduct.stock))}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-6">
                          {sortedLevels.map((level, idx) => {
                            const color = colors[idx % colors.length];
                            const gananciaPorUnidad = (level.salePrice ?? 0) - (level.purchasePrice ?? 0);
                            const valorCompraTotal = level.initialStock * level.purchasePrice;
                            const valorVentaTotal = level.initialStock * level.salePrice;
                            const gananciaNivelTotal = level.initialStock * gananciaPorUnidad;

                            return (
                              <div key={level.id} className={`bg-white border ${color.border} rounded-xl overflow-hidden shadow-lg`}>
                                <div className={`${color.headerBg} px-4 py-3 border-b ${color.border}`}>
                                  <div className="flex justify-between items-center">
                                    <h4 className="text-lg font-bold text-slate-800">{level.name}</h4>
                                    <span className="text-xs text-slate-600 bg-white px-2 py-1 rounded border border-slate-200">
                                      {level.baseUnitsContained} unidades por nivel
                                    </span>
                                  </div>
                                </div>
                                <div className="p-4 space-y-6">
                                  <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-3 bg-white p-3 rounded-lg border border-slate-200">
                                      <div className="space-y-1">
                                        <p className="text-xs font-semibold text-slate-500 uppercase">STOCK INICIAL</p>
                                        <p className="text-xl font-bold text-slate-900">{level.initialStock}</p>
                                        <p className="text-[11px] text-slate-400 font-medium">→ {level.initialStock * level.baseUnitsContained} und</p>
                                      </div>
                                      <div className="space-y-1">
                                        <p className="text-xs font-semibold text-slate-500 uppercase">STOCK ACTUAL</p>
                                        <p className="text-xl font-bold text-blue-600">{level.stock}</p>
                                        <p className="text-[11px] text-slate-400 font-medium">→ {level.stock * level.baseUnitsContained} und</p>
                                      </div>
                                    </div>
                                    <div className="border-t border-slate-200"></div>
                                  </div>
                                  <div className="space-y-4">
                                    <div className="space-y-3">
                                      {userRole === 'admin' && (
                                      <div className="flex justify-between items-center pb-3 border-b border-slate-200">
                                        <p className="text-xs font-semibold text-slate-500">P. Compra (u)</p>
                                        <p className="text-lg font-semibold text-slate-800">S/ {(level.purchasePrice ?? 0).toFixed(2)}</p>
                                      </div>
                                      )}
                                      <div className="flex justify-between items-center pb-3 border-b border-slate-200">
                                        <p className="text-xs font-semibold text-slate-500">P. Venta (u)</p>
                                        <p className="text-lg font-semibold text-slate-800">S/ {(level.salePrice ?? 0).toFixed(2)}</p>
                                      </div>
                                      {userRole === 'admin' && (
                                      <div className="flex justify-between items-center">
                                        <p className="text-xs font-semibold text-slate-500">Ganancia (u)</p>
                                        <p className="text-lg font-semibold text-blue-600">+ S/ {gananciaPorUnidad.toFixed(2)}</p>
                                      </div>
                                      )}
                                    </div>
                                    <div className="border-t border-slate-200"></div>
                                  </div>
                                  <div className="space-y-4">
                                    <div className="space-y-3">
                                      {userRole === 'admin' && (
                                      <div className="flex justify-between items-center pb-3 border-b border-slate-200">
                                        <p className="text-xs font-semibold text-slate-500 uppercase">VALOR COMPRA</p>
                                        <p className="text-lg font-semibold text-slate-800">{formatCurrency(valorCompraTotal)}</p>
                                      </div>
                                      )}
                                      {userRole === 'admin' && (
                                      <div className="flex justify-between items-center">
                                        <p className="text-xs font-semibold text-slate-500 uppercase">VALOR VENTA</p>
                                        <p className="text-lg font-semibold text-slate-800">{formatCurrency(valorVentaTotal)}</p>
                                      </div>
                                      )}
                                      <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                                        <p className="text-xs font-semibold text-slate-500 uppercase">Total Unidades</p>
                                        <p className="text-lg font-semibold text-slate-700">{level.stock * level.baseUnitsContained} und</p>
                                      </div>
                                    </div>
                                  </div>
                                  {userRole === 'admin' && (
                                  <div className={`${color.profitBg} text-white px-4 py-3 rounded-lg flex justify-between items-center`}>
                                    <p className="text-sm font-semibold uppercase">Ganancia del Nivel</p>
                                    <p className="text-xl font-bold">{formatCurrency(gananciaNivelTotal)}</p>
                                  </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {userRole === 'admin' && (
                        <div className="mt-6 bg-slate-900 border border-slate-800 text-slate-100 rounded-xl p-5 shadow-lg space-y-4">
                          <div className="flex items-center gap-2 text-indigo-400">
                            <TrendingUp className="w-5 h-5 text-indigo-400" />
                            <h4 className="font-bold text-sm uppercase tracking-wider text-slate-200">Resumen Financiero Total del Stock</h4>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
                            <div className="pt-4 sm:pt-0">
                              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Valor Compra Total</p>
                              <p className="text-2xl font-black text-blue-400 mt-1">
                                S/ {sortedLevels.reduce((sum, l) => sum + l.initialStock * l.purchasePrice, 0).toFixed(2)}
                              </p>
                            </div>
                            <div className="pt-4 sm:pt-0">
                              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Valor Venta Total</p>
                              <p className="text-2xl font-black text-green-400 mt-1">
                                S/ {sortedLevels.reduce((sum, l) => sum + l.initialStock * l.salePrice, 0).toFixed(2)}
                              </p>
                            </div>
                            <div className="pt-4 sm:pt-0">
                              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ganancia Total Proyectada</p>
                              <p className="text-2xl font-black text-purple-400 mt-1">
                                S/ {sortedLevels.reduce((sum, l) => sum + l.initialStock * (l.salePrice - l.purchasePrice), 0).toFixed(2)}
                              </p>
                            </div>
                          </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Row 2: All levels in CSS grid with fixed columns (only for hasUnidad) */}
                {hasUnidad && (() => {
                  const overflow = sortedLevels.length > 4;
                  return (
                  <div
                    className={overflow ? "flex flex-wrap justify-center gap-6" : "grid gap-6"}
                    style={overflow ? undefined : { gridTemplateColumns: `repeat(${sortedLevels.length}, 1fr)` }}
                  >
                    {sortedLevels.map((level, idx) => {
                      const color = colors[idx % colors.length];
                      const gananciaPorUnidad = (level.salePrice ?? 0) - (level.purchasePrice ?? 0);
                      return (
                        <div key={level.id} className={`bg-white border ${color.border} rounded-xl overflow-hidden shadow-sm ${overflow ? 'w-[calc(25%_-_1.125rem)]' : ''}`}>
                          <div className={`${color.headerBg} px-4 py-3 border-b ${color.border}`}>
                            <div className="flex justify-between items-center">
                              <h4 className="text-sm font-bold text-slate-800">{level.name}</h4>
                              <span className="text-[10px] text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                {level.baseUnitsContained} unid. / {level.name}
                              </span>
                            </div>
                          </div>
                          <div className="p-4">
                            <div className="space-y-3">
                              {userRole === 'admin' && (
                              <div className="flex justify-between items-center text-xs">
                                <p className="text-slate-500">P. Compra</p>
                                <p className="font-semibold text-slate-800">S/ {(level.purchasePrice ?? 0).toFixed(2)}</p>
                              </div>
                              )}
                              <div className="flex justify-between items-center text-xs">
                                <p className="text-slate-500">P. Venta</p>
                                <p className="font-semibold text-blue-600">S/ {(level.salePrice ?? 0).toFixed(2)}</p>
                              </div>
                            </div>
                            {userRole === 'admin' && (
                              <>
                                <div className="border-t border-slate-200 my-3"></div>
                                <div className="flex justify-between items-center text-xs pt-1">
                                  <p className="text-slate-500 font-medium">Ganancia</p>
                                  <p className="font-semibold text-emerald-600">+ S/ {gananciaPorUnidad.toFixed(2)}</p>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  );
                })()}

                {/* Row 3: VENTAS POR RESTOK (only for hasUnidad) */}
                {userRole === 'admin' && hasUnidad && (() => {
                  const productId = viewingMayoristaProduct.id;
                  const productHistory = modalProductHistory;
                  const boundaryEvents = productHistory.filter(h => h.type === 'restock' || h.type === 'initial')
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                  const productSales = productHistory.filter(h => h.type === 'sale' && h.affectedLevelName)
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                  
                  const buildPeriods = () => {
                    const periods = [];
                    if (boundaryEvents.length === 0) return periods;
                    for (let i = 0; i < boundaryEvents.length; i++) {
                      const startDate = boundaryEvents[i].date;
                      const endDate = i + 1 < boundaryEvents.length ? boundaryEvents[i + 1].date : null;
                      const periodSales = productSales.filter(s => {
                        const sDate = new Date(s.date);
                        const start = new Date(startDate);
                        if (!endDate) return sDate >= start;
                        return sDate >= start && sDate < new Date(endDate);
                      });
                      const unitsSold = periodSales.reduce((total, s) => {
                        const lvl = viewingMayoristaProduct.saleLevels?.find(l => l.name === s.affectedLevelName);
                        if (!lvl) return total;
                        return total + (s.levelQuantity || 0) * (lvl.baseUnitsContained || 1);
                      }, 0);
                      const isPriceChange = boundaryEvents[i].type === 'price_change';
                      periods.push({
                        type: boundaryEvents[i].type,
                        date: boundaryEvents[i].date,
                        quantity: isPriceChange ? 0 : boundaryEvents[i].quantity,
                        unitsSold,
                        remaining: isPriceChange
                          ? (i > 0 ? periods[i - 1].remaining : (boundaryEvents[i].quantity || 0))
                          : Math.max(0, (boundaryEvents[i].quantity || 0) - unitsSold),
                        sales: periodSales,
                        priceChanges: boundaryEvents[i].priceChanges || []
                      });
                    }
                    return periods;
                  };
                  
                  const periods = buildPeriods();
                  const productPriceChanges = productHistory.filter(h => h.type === 'price_change')
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                  for (let pi = 0; pi < periods.length; pi++) {
                    const startDate = new Date(periods[pi].date);
                    const endDate = pi + 1 < periods.length ? new Date(periods[pi + 1].date) : null;
                    periods[pi].priceChanges = productPriceChanges.filter(pc => {
                      const pcDate = new Date(pc.date);
                      if (!endDate) return pcDate >= startDate;
                      return pcDate >= startDate && pcDate < endDate;
                    });
                  }
                  const allLevelNames: string[] = [...(viewingMayoristaProduct.saleLevels || [])]
                    .sort((a, b) => { if (a.name === 'Unidad') return -1; if (b.name === 'Unidad') return 1; return a.baseUnitsContained - b.baseUnitsContained; })
                    .map(l => l.name);
                  
                  return (
                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                      <div className="flex items-center gap-2 text-indigo-600">
                        <FileText className="w-5 h-5" />
                        <h4 className="font-bold text-sm uppercase tracking-wider">Ventas por Restock</h4>
                      </div>
                      {(() => {
                        let restockCounter = 0;
                        return periods.map((period, pi) => {
                          const byLevel: Record<string, number> = {};
                          for (const s of period.sales) {
                            const levelName = s.affectedLevelName;
                            if (levelName) {
                              byLevel[levelName] = (byLevel[levelName] || 0) + (s.levelQuantity || s.quantity || 0);
                            }
                          }
                          const isCurrentPeriod = pi === periods.length - 1;
                          const periodLabel = period.type === 'initial' ? 'Stock Inicial' :
                            `Restock #${++restockCounter}`;
                          
                          return (
                            <div key={pi} className="border border-slate-200 rounded-lg overflow-hidden">
                              <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                                <div className="flex flex-col">
                                  <span className="font-semibold text-sm text-slate-700">
                                    {periodLabel}
                                    {isCurrentPeriod && (
                                      <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">⭐ Período Actual</span>
                                    )}
                                  </span>
                                  <span className="text-[10px] text-slate-400 mt-0.5">
                                    {period.type === 'initial'
                                      ? `${period.quantity} und iniciales`
                                      : (() => {
                                          const prev = pi > 0 ? periods[pi - 1] : null;
                                          const prevRemaining = prev ? prev.remaining : 0;
                                          return `sobraron ${prevRemaining} + ${period.quantity} agregados = ${prevRemaining + period.quantity} und`;
                                        })()
                                    }
                                    <span className="text-slate-500 font-medium ml-1">
                                      · {period.date ? new Date(period.date).toLocaleDateString('es-PE') : ''}
                                    </span>
                                  </span>
                                </div>
                              </div>
                              <div className="p-3">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-slate-500 border-b border-slate-200">
                                      <th className="text-left py-1.5 font-medium">Nivel</th>
                                      <th className="text-right py-1.5 font-medium">Vendido</th>
                                      <th className="text-right py-1.5 font-medium">Precio Venta</th>
                                      <th className="text-right py-1.5 font-medium">Total</th>
                                      <th className="text-right py-1.5 font-medium">Ganancia</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {allLevelNames.map(ln => {
                                      const lvl = viewingMayoristaProduct.saleLevels?.find(l => l.name === ln);
                                      const qty = byLevel[ln] || 0;
                                      const price = lvl?.salePrice || 0;
                                      const costPerUnit = lvl?.purchasePrice || 0;
                                      const revenue = qty * price;
                                      const cost = qty * costPerUnit;
                                      const profit = revenue - cost;
                                      return (
                                        <tr key={ln} className="border-b border-slate-50">
                                          <td className="py-1.5 font-medium text-slate-700">{ln}</td>
                                          <td className="py-1.5 text-right text-slate-600">{qty}</td>
                                          <td className="py-1.5 text-right text-slate-600">S/ {price.toFixed(2)}</td>
                                          <td className="py-1.5 text-right text-green-600">S/ {revenue.toFixed(2)}</td>
                                          <td className="py-1.5 text-right font-semibold text-blue-600">S/ {profit.toFixed(2)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              {period.priceChanges && period.priceChanges.length > 0 && (() => {
                                return (
                                  <div className="mx-3 mb-3 space-y-3">
                                    {period.priceChanges.map((pcEntry: any, pci: number) => {
                                      return (pcEntry.priceChanges || []).map((pc: any, pci2: number) => {
                                        const salesAfterPC = period.sales.filter((s: any) =>
                                          s.affectedLevelName === pc.levelName && new Date(s.date) >= new Date(pcEntry.date)
                                        );
                                        const qty = salesAfterPC.reduce((sum: number, s: any) => sum + (s.levelQuantity || s.quantity || 0), 0);
                                        const revenue = qty * (pc.newSalePrice || 0);
                                        const cost = qty * (pc.newPurchasePrice || 0);
                                        const profit = revenue - cost;
                                        return (
                                          <div key={`${pci}-${pci2}`} className="border border-indigo-200 rounded-lg overflow-hidden bg-indigo-50/40 shadow-sm">
                                            <div className="px-3 py-1.5 border-b border-indigo-200 bg-indigo-100">
                                              <span className="text-xs font-semibold text-indigo-800">Ajuste de Precio #{pci + 1}</span>
                                              <span className="ml-3 px-2 py-0.5 bg-indigo-200/60 text-indigo-700 rounded-md text-[11px] font-semibold">
                                                {new Date(pcEntry.date).toLocaleDateString('es-PE')}
                                              </span>
                                            </div>
                                            <div className="px-3 py-2 space-y-2">
                                              <div className="text-xs font-medium text-indigo-700 mb-2">{pc.levelName}</div>
                                              <div className="grid grid-cols-4 gap-2">
                                                <div className="bg-slate-50 rounded-lg border border-slate-200 p-2.5">
                                                  <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">P.Compra anterior</p>
                                                  <p className="text-sm font-bold text-slate-800">S/ {pc.oldPurchasePrice?.toFixed(2)}</p>
                                                </div>
                                                <div className={`rounded-lg border p-2.5 ${pc.oldPurchasePrice !== pc.newPurchasePrice ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                                                  <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">P.Compra nuevo</p>
                                                  <p className={`text-sm font-bold flex items-center gap-1 ${pc.oldPurchasePrice !== pc.newPurchasePrice ? 'text-emerald-700' : 'text-slate-800'}`}>
                                                    S/ {pc.newPurchasePrice?.toFixed(2)}
                                                    {pc.oldPurchasePrice !== pc.newPurchasePrice && (
                                                      <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                    )}
                                                  </p>
                                                </div>
                                                <div className="bg-slate-50 rounded-lg border border-slate-200 p-2.5">
                                                  <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">P.Venta anterior</p>
                                                  <p className="text-sm font-bold text-slate-800">S/ {pc.oldSalePrice?.toFixed(2)}</p>
                                                </div>
                                                <div className={`rounded-lg border p-2.5 ${pc.oldSalePrice !== pc.newSalePrice ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                                                  <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">P.Venta nuevo</p>
                                                  <p className={`text-sm font-bold flex items-center gap-1 ${pc.oldSalePrice !== pc.newSalePrice ? 'text-emerald-700' : 'text-slate-800'}`}>
                                                    S/ {pc.newSalePrice?.toFixed(2)}
                                                    {pc.oldSalePrice !== pc.newSalePrice && (
                                                      <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                    )}
                                                  </p>
                                                </div>
                                              </div>
                                              <div className="border-t border-slate-100 pt-2 mt-2">
                                                <table className="w-full text-xs">
                                                  <thead>
                                                    <tr className="text-slate-500 border-b border-slate-200">
                                                      <th className="text-left py-1 font-medium">Nivel</th>
                                                      <th className="text-right py-1 font-medium">Vendido</th>
                                                      <th className="text-right py-1 font-medium">P.Venta</th>
                                                      <th className="text-right py-1 font-medium">Total</th>
                                                      <th className="text-right py-1 font-medium">Ganancia</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    <tr className="border-b border-slate-100">
                                                      <td className="py-1 font-medium text-slate-700">{pc.levelName}</td>
                                                      <td className="py-1 text-right text-slate-600">{qty}</td>
                                                      <td className="py-1 text-right text-slate-600">S/ {(pc.newSalePrice || 0).toFixed(2)}</td>
                                                      <td className="py-1 text-right text-green-700">S/ {revenue.toFixed(2)}</td>
                                                      <td className="py-1 text-right font-semibold text-blue-700">S/ {profit.toFixed(2)}</td>
                                                    </tr>
                                                  </tbody>
                                                </table>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      });
                                    })}
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  );
                })()}

                {/* Price Changes for Mayorista (no Unidad level) */}
                {userRole === 'admin' && !hasUnidad && viewingMayoristaProduct && (() => {
                  const productPriceChanges = stockHistory
                    .filter(h => h.productId === viewingMayoristaProduct.id && h.type === 'price_change')
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                  if (productPriceChanges.length === 0) return null;
                  return (
                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                      <div className="flex items-center gap-2 text-indigo-600">
                        <FileText className="w-5 h-5" />
                        <h4 className="font-bold text-sm uppercase tracking-wider">Ajustes de Precio</h4>
                      </div>
                      <div className="space-y-3">
                        {productPriceChanges.map((entry: any, ei: number) => {
                          return (entry.priceChanges || []).map((pc: any, pci: number) => {
                            return (
                              <div key={`${ei}-${pci}`} className="border border-indigo-200 rounded-lg overflow-hidden bg-indigo-50/40 shadow-sm">
                                <div className="px-3 py-1.5 border-b border-indigo-200 bg-indigo-100">
                                  <span className="text-xs font-semibold text-indigo-800">Ajuste de Precio #{ei + 1}</span>
                                  <span className="ml-3 px-2 py-0.5 bg-indigo-200/60 text-indigo-700 rounded-md text-[11px] font-semibold">
                                    {new Date(entry.date).toLocaleDateString('es-PE')}
                                  </span>
                                </div>
                                <div className="px-3 py-2 space-y-2">
                                  <div className="text-xs font-medium text-indigo-700 mb-2">{pc.levelName}</div>
                                  <div className="grid grid-cols-4 gap-2">
                                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-2.5">
                                      <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">P.Compra anterior</p>
                                      <p className="text-sm font-bold text-slate-800">S/ {pc.oldPurchasePrice?.toFixed(2)}</p>
                                    </div>
                                    <div className={`rounded-lg border p-2.5 ${pc.oldPurchasePrice !== pc.newPurchasePrice ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                                      <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">P.Compra nuevo</p>
                                      <p className={`text-sm font-bold flex items-center gap-1 ${pc.oldPurchasePrice !== pc.newPurchasePrice ? 'text-emerald-700' : 'text-slate-800'}`}>
                                        S/ {pc.newPurchasePrice?.toFixed(2)}
                                        {pc.oldPurchasePrice !== pc.newPurchasePrice && (
                                          <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                        )}
                                      </p>
                                    </div>
                                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-2.5">
                                      <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">P.Venta anterior</p>
                                      <p className="text-sm font-bold text-slate-800">S/ {pc.oldSalePrice?.toFixed(2)}</p>
                                    </div>
                                    <div className={`rounded-lg border p-2.5 ${pc.oldSalePrice !== pc.newSalePrice ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                                      <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">P.Venta nuevo</p>
                                      <p className={`text-sm font-bold flex items-center gap-1 ${pc.oldSalePrice !== pc.newSalePrice ? 'text-emerald-700' : 'text-slate-800'}`}>
                                        S/ {pc.newSalePrice?.toFixed(2)}
                                        {pc.oldSalePrice !== pc.newSalePrice && (
                                          <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          });
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Modal Agregar Producto */}
      <Dialog open={isAddProductOpen} onOpenChange={(open) => {
        if (open) {
          if (newProductType === 'mayorista') {
            setAddProductMode('mayorista');
            limpiarFormularioMayorista();
          } else {
            setAddProductMode('unidad');
          }
        } else {
          setNewProductType('general');
          limpiarFormularioAgregarProducto();
        }
        setIsAddProductOpen(open);
      }}>
        <DialogContent className={newProductType === 'mayorista' ? "max-w-2xl sm:max-w-3xl md:max-w-4xl" : "max-w-md"}>
          <DialogHeader>
            <DialogTitle>Agregar producto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {newProductType === 'general' && (
              <div>
                <div className="flex space-x-2 mb-4">
                  <Button
                    type="button"
                    variant={addProductMode === 'unidad' ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={() => {
                      setAddProductMode('unidad');
                      setNewProduct({ name: '', purchasePrice: 0, salePrice: 0, stock: 0, category: '' });
                      setUnitPurchaseInput('');
                      setUnitSaleInput('');
                    }}
                  >
                    Unidad
                  </Button>
                  <Button
                    type="button"
                    variant={addProductMode === 'peso' ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={() => {
                      setAddProductMode('peso');
                      limpiarFormularioPeso();
                    }}
                  >
                    Peso
                  </Button>
                </div>
              </div>
            )}

            {addProductMode === 'unidad' && (
              /* Formulario para productos por unidad */
              <>
                <div>
                  <Label htmlFor="productName">Nombre</Label>
                  <Input
                    id="productName"
                    placeholder="oregano"
                    value={newProduct.name}
                    onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="purchasePrice">Precio de compra</Label>
                  <Input
                    id="purchasePrice"
                    type="text"
                    inputMode="decimal"
                    placeholder="10.00"
                    value={unitPurchaseInput}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const normalized = raw.replace(',', '.');
                      if (raw === '' || /^\d*(?:[.,]\d{0,2})?$/.test(raw)) {
                        setUnitPurchaseInput(raw);
                        const num = normalized === '' ? 0 : parseFloat(normalized) || 0;
                        setNewProduct({ ...newProduct, purchasePrice: num });
                      }
                    }}
                    onBlur={(e) => {
                      const v = e.target.value.replace(',', '.');
                      if (v !== '' && !isNaN(Number(v))) {
                        const n = Math.round(parseFloat(v) * 100) / 100;
                        setNewProduct({ ...newProduct, purchasePrice: n });
                        setUnitPurchaseInput(n.toFixed(2));
                      } else {
                        setUnitPurchaseInput('');
                      }
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="salePrice">Precio de venta</Label>
                  <Input
                    id="salePrice"
                    type="text"
                    inputMode="decimal"
                    placeholder="20.00"
                    value={unitSaleInput}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const normalized = raw.replace(',', '.');
                      if (raw === '' || /^\d*(?:[.,]\d{0,2})?$/.test(raw)) {
                        setUnitSaleInput(raw);
                        const num = normalized === '' ? 0 : parseFloat(normalized) || 0;
                        setNewProduct({ ...newProduct, salePrice: num });
                      }
                    }}
                    onBlur={(e) => {
                      const v = e.target.value.replace(',', '.');
                      if (v !== '' && !isNaN(Number(v))) {
                        const n = Math.round(parseFloat(v) * 100) / 100;
                        setNewProduct({ ...newProduct, salePrice: n });
                        setUnitSaleInput(n.toFixed(2));
                      } else {
                        setUnitSaleInput('');
                      }
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="stock">Cantidad en stock</Label>
                  <Input
                    id="stock"
                    type="text"
                    placeholder=""
                    value={newProduct.stock || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '' || /^\d+$/.test(value)) {
                        setNewProduct({...newProduct, stock: value === '' ? 0 : parseInt(value)});
                      }
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="category">Categoría</Label>
                  <Input
                    id="category"
                    placeholder=""
                    value={newProduct.category}
                    onChange={(e) => setNewProduct({...newProduct, category: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Imagen del producto</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setNewProductImage(file);
                        const reader = new FileReader();
                        reader.onloadend = () => setNewProductImagePreview(reader.result as string);
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                  {newProductImagePreview && (
                    <div className="mt-2">
                      <img src={newProductImagePreview} alt="Preview" className="w-full h-32 object-cover rounded-lg border" />
                    </div>
                  )}
                </div>
              </>
            )}

            {addProductMode === 'peso' && (
              /* Formulario para productos por peso */
              <>
                <div>
                  <Label htmlFor="weightProductName">Nombre</Label>
                  <Input
                    id="weightProductName"
                    placeholder="oregano"
                    value={newWeightProduct.name}
                    onChange={(e) => setNewWeightProduct({...newWeightProduct, name: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="purchasePricePerKg" className="block min-h-[20px]">Precio de Compra por Kilo</Label>
                    <Input
                      id="purchasePricePerKg"
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={purchasePerKgInput}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const normalized = raw.replace(',', '.');
                        if (raw === '' || /^\d*(?:[.,]\d{0,2})?$/.test(raw)) {
                          setPurchasePerKgInput(raw);
                          const num = normalized === '' ? 0 : parseFloat(normalized) || 0;
                          setNewWeightProduct({ ...newWeightProduct, purchasePrice: num, purchasePricePerKg: num });
                        }
                      }}
                      onBlur={(e) => {
                        const v = e.target.value.replace(',', '.');
                        if (v !== '' && !isNaN(Number(v))) {
                          const n = Math.round(parseFloat(v) * 100) / 100;
                          setNewWeightProduct({ ...newWeightProduct, purchasePrice: n, purchasePricePerKg: n });
                          setPurchasePerKgInput(n.toFixed(2));
                        } else {
                          setPurchasePerKgInput('');
                        }
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="salePricePerKg" className="block min-h-[20px]">Precio de Venta por Kilo</Label>
                    <Input
                      id="salePricePerKg"
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={salePerKgInput}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const normalized = raw.replace(',', '.');
                        if (raw === '' || /^\d*(?:[.,]\d{0,2})?$/.test(raw)) {
                          setSalePerKgInput(raw);
                          const num = normalized === '' ? 0 : parseFloat(normalized) || 0;
                          setNewWeightProduct({ ...newWeightProduct, salePrice: num, salePricePerKg: num });
                          setEquivalentGramsInput(num > 0 ? (num / 1000).toFixed(3) : '');
                        }
                      }}
                      onBlur={(e) => {
                        const v = e.target.value.replace(',', '.');
                        if (v !== '' && !isNaN(Number(v))) {
                          const n = Math.round(parseFloat(v) * 100) / 100;
                          setNewWeightProduct({ ...newWeightProduct, salePrice: n, salePricePerKg: n });
                          setSalePerKgInput(n.toFixed(2));
                          setEquivalentGramsInput(n > 0 ? (n / 1000).toFixed(3) : '');
                        } else {
                          setSalePerKgInput('');
                        }
                      }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <div className="bg-green-100 p-3 rounded-lg text-center">
                    <div className="text-sm text-green-700 font-medium">Precio de Venta por Gramo: S/ {newWeightProduct.salePrice ? (newWeightProduct.salePrice / 1000).toFixed(3) : '0.000'}</div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="equivalentGrams">Equivale por gramo</Label>
                  <Input
                    id="equivalentGrams"
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={equivalentGramsInput}
                    onChange={(e) => setEquivalentGramsInput(e.target.value)}
                    className={equivalentGramsError ? "border-red-500 focus-visible:ring-red-500" : ""}
                  />
                  <p className={`mt-1 text-xs ${equivalentGramsError ? 'text-red-600' : 'text-slate-500'}`}>
                    {equivalentGramsError || 'Ingresa un valor numerico con hasta 3 decimales. La conversion se actualiza al escribir.'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="weightInitialStock">Stock inicial (g)</Label>
                    <Input
                      id="weightInitialStock"
                      type="text"
                      placeholder="0"
                      value={newWeightProduct.initialStock || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || value === '0' || /^\d+$/.test(value)) {
                          setNewWeightProduct({...newWeightProduct, initialStock: value === '' ? 0 : parseInt(value) || 0});
                        }
                      }}
                    />
                  </div>
                  <div className="flex items-end">
                    <div className="bg-green-100 px-3 py-2 rounded text-sm font-medium text-green-700 w-full text-center">
                      Conversión<br/>{newWeightProduct.initialStock ? `${(newWeightProduct.initialStock / 1000).toFixed(1)}kg` : '0kg'}
                    </div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="minWeight">Peso mínimo (g)</Label>
                  <Input
                    id="minWeight"
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={minWeightInput}
                    onChange={(e) => setMinWeightInput(e.target.value)}
                    className={minWeightError ? "border-red-500 focus-visible:ring-red-500" : ""}
                  />
                  <p className={`mt-1 text-xs ${minWeightError ? 'text-red-600' : 'text-slate-500'}`}>
                    {minWeightError || 'El peso minimo debe ser valido y no superar el stock inicial.'}
                  </p>
                </div>
                <div>
                  <Label htmlFor="weightCategory">Categoría</Label>
                  <Input
                    id="weightCategory"
                    placeholder="especias"
                    value={newWeightProduct.category}
                    onChange={(e) => setNewWeightProduct({...newWeightProduct, category: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Imagen del producto</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setNewProductImage(file);
                        const reader = new FileReader();
                        reader.onloadend = () => setNewProductImagePreview(reader.result as string);
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                  {newProductImagePreview && (
                    <div className="mt-2">
                      <img src={newProductImagePreview} alt="Preview" className="w-full h-32 object-cover rounded-lg border" />
                    </div>
                  )}
                </div>
              </>
            )}

            {addProductMode === 'mayorista' && (
              <>
                {/* Información General */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 border-l-4 border-indigo-600 pl-3">
                    <h3 className="font-bold text-slate-900 text-sm">Información General</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="mayoristaProductName">Nombre del Producto</Label>
                      <Input
                        id="mayoristaProductName"
                        placeholder="taper 1/2"
                        value={newMayoristaProduct.name}
                        onChange={(e) => setNewMayoristaProduct({...newMayoristaProduct, name: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label htmlFor="mayoristaCategory">Categoría</Label>
                      <Input
                        id="mayoristaCategory"
                        placeholder="tapers"
                        value={newMayoristaProduct.category}
                        onChange={(e) => setNewMayoristaProduct({...newMayoristaProduct, category: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                {/* Niveles de Venta */}
                <div className="space-y-4 pt-4">
                  <div className="flex items-center gap-2 border-l-4 border-indigo-600 pl-3">
                    <h3 className="font-bold text-slate-900 text-sm">Niveles de Venta</h3>
                  </div>

                  {newMayoristaLevels.length > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader className="bg-slate-50">
                          <TableRow>
                            <TableHead className="text-[11px] font-bold text-slate-700">Nivel</TableHead>
                            <TableHead className="text-[11px] font-bold text-slate-700">Contenido</TableHead>
                            <TableHead className="text-[11px] font-bold text-slate-700">P. Compra</TableHead>
                            <TableHead className="text-[11px] font-bold text-slate-700">P. Venta</TableHead>
                            <TableHead className="text-[11px] font-bold text-slate-700">Stock</TableHead>
                            <TableHead className="text-[11px] font-bold text-slate-700 text-center">Acciones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[...newMayoristaLevels].sort((a, b) => { if (a.name === 'Unidad') return -1; if (b.name === 'Unidad') return 1; return a.baseUnitsContained - b.baseUnitsContained; }).map((lvl, i) => (
                            <TableRow key={lvl.id}>
                              {editingNewLevelId === lvl.id ? (
                                <>
                                  <TableCell className="py-2">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-slate-900 text-xs">{lvl.name}</span>
                                      {i === 0 && (
                                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[9px]">
                                          nivel mínimo
                                        </Badge>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="py-2">
                                    {lvl.name === 'Unidad' ? (
                                      <span className="text-xs text-slate-600">1 unid.</span>
                                    ) : (
                                      <Input
                                        type="text"
                                        value={editNewTempContains}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          if (val === '' || /^\d*$/.test(val)) setEditNewTempContains(val);
                                        }}
                                        className="h-7 text-xs w-16"
                                      />
                                    )}
                                  </TableCell>
                                  <TableCell className="py-2">
                                    <Input
                                      type="text"
                                      value={editNewTempPurchasePrice}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '' || /^\d*\.?\d*$/.test(val)) setEditNewTempPurchasePrice(val);
                                      }}
                                      className="h-7 text-xs w-20"
                                    />
                                  </TableCell>
                                  <TableCell className="py-2">
                                    <Input
                                      type="text"
                                      value={editNewTempSalePrice}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '' || /^\d*\.?\d*$/.test(val)) setEditNewTempSalePrice(val);
                                      }}
                                      className="h-7 text-xs w-20"
                                    />
                                  </TableCell>
                                  <TableCell className="py-2">
                                    {(() => {
                                      const hasUnidad = newMayoristaLevels.some(l => l.name === 'Unidad');
                                      const isStockEditable = lvl.name === 'Unidad' || !hasUnidad;
                                      return isStockEditable ? (
                                        <Input
                                          type="text"
                                          value={editNewTempStock}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === '' || /^\d*$/.test(val)) setEditNewTempStock(val);
                                          }}
                                          className="h-7 text-xs w-16"
                                        />
                                      ) : (
                                        <span className="text-xs text-slate-400">—</span>
                                      );
                                    })()}
                                  </TableCell>
                                  <TableCell className="py-2 text-center">
                                    <div className="flex gap-1 justify-center">
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 text-green-600 hover:text-green-800 hover:bg-green-50"
                                        onClick={() => {
                                          const hasUnidad = newMayoristaLevels.some(l => l.name === 'Unidad');
                                          const isStockEditable = lvl.name === 'Unidad' || !hasUnidad;
                                          const newStock = isStockEditable ? parseInt(editNewTempStock) : lvl.stock;
                                          const newSP = parseFloat(editNewTempSalePrice);
                                          const newPP = parseFloat(editNewTempPurchasePrice);
                                          const newContains = lvl.name !== 'Unidad' ? parseInt(editNewTempContains) : lvl.baseUnitsContained;
                                          if ((isStockEditable && (isNaN(newStock) || newStock < 0)) || isNaN(newSP) || newSP < 0 || isNaN(newPP) || newPP < 0 || isNaN(newContains) || newContains <= 0) {
                                            toast({ title: "Valores no válidos", variant: "destructive" });
                                            return;
                                          }
                                          setNewMayoristaLevels(newMayoristaLevels.map(l =>
                                            l.id === lvl.id ? { ...l, stock: newStock, salePrice: newSP, purchasePrice: newPP, baseUnitsContained: newContains } : l
                                          ));
                                          setEditingNewLevelId(null);
                                        }}
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                      </Button>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                        onClick={() => setEditingNewLevelId(null)}
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </>
                              ) : (
                                <>
                                  <TableCell className="py-2">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-slate-900 text-xs">{lvl.name}</span>
                                      {i === 0 && (
                                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[9px]">
                                          nivel mínimo
                                        </Badge>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="py-2 text-xs text-slate-600">
                                    {lvl.baseUnitsContained} unid.
                                  </TableCell>
                                  <TableCell className="py-2 text-xs text-blue-700 font-medium">
                                    S/ {(lvl.purchasePrice ?? 0).toFixed(2)}
                                  </TableCell>
                                  <TableCell className="py-2 text-xs text-green-700 font-medium">
                                    S/ {(lvl.salePrice ?? 0).toFixed(2)}
                                  </TableCell>
                                  <TableCell className="py-2 text-xs font-bold">
                                    {(() => {
                                      const hasUn = newMayoristaLevels.some(l => l.name === 'Unidad');
                                      if (hasUn && lvl.name !== 'Unidad') return <span className="text-slate-400">—</span>;
                                      return <>{lvl.stock} {lvl.name}(s)</>;
                                    })()}
                                  </TableCell>
                                  <TableCell className="py-2 text-center">
                                    <div className="flex gap-1 justify-center">
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                        onClick={() => {
                                          const hasUnidad = newMayoristaLevels.some(l => l.name === 'Unidad');
                                          const isStockEditable = lvl.name === 'Unidad' || !hasUnidad;
                                          setEditNewTempStock(lvl.stock.toString());
                                          setEditNewTempPurchasePrice(lvl.purchasePrice.toString());
                                          setEditNewTempSalePrice(lvl.salePrice.toString());
                                          setEditNewTempContains(lvl.baseUnitsContained.toString());
                                          setEditingNewLevelId(lvl.id);
                                        }}
                                      >
                                        <Edit className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 text-red-600 hover:text-red-800 hover:bg-red-50"
                                        onClick={() => setNewMayoristaLevels(newMayoristaLevels.filter(l => l.id !== lvl.id))}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  
                  {/* Agregar Nuevo Nivel */}
                  <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg p-4">
                    <p className="text-xs font-semibold text-slate-700 mb-3">Agregar Nuevo Nivel</p>
                    {newMayoristaLevels.some(l => l.name === 'Unidad') && newMayoristaLevels.length <= 1 && (
                      <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-3 mx-1 w-fit">
                        Debes agregar al menos un nivel adicional (Paquete, Ciento, etc.) además de Unidad
                      </p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                      <div>
                        <Label className="text-[10px]">Seleccionar Nivel</Label>
                        <Select value={newLevelDropdown} onValueChange={setNewLevelDropdown}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Elige un nivel..." />
                          </SelectTrigger>
                          <SelectContent>
                            {['Unidad', 'Paquete', 'Ciento', 'Millar', 'Plancha', 'Fardo', 'Personalizado'].filter(n => !newMayoristaLevels.find(l => l.name === n)).map(n => (
                              <SelectItem key={n} value={n}>{n}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {newLevelDropdown === 'Personalizado' && (
                          <Input
                            type="text"
                            placeholder="Nombre del nivel..."
                            value={newLevelCustomName}
                            onChange={(e) => setNewLevelCustomName(e.target.value)}
                            className="h-8 text-xs mt-2"
                          />
                        )}
                      </div>
                      <div>
                        <Label className="text-[10px]">Contenido (unid.)</Label>
                        <Input
                          type="text"
                          placeholder="Ej: 25"
                          value={newLevelDropdown === 'Unidad' ? '1' : newLevelContains}
                          onChange={(e) => setNewLevelContains(e.target.value)}
                          className="h-8 text-xs"
                          disabled={newLevelDropdown === 'Unidad'}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">P. Compra (S/)</Label>
                        <Input
                          type="text"
                          placeholder="0.00"
                          value={newLevelPurchasePrice}
                          onChange={(e) => setNewLevelPurchasePrice(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">P. Venta (S/)</Label>
                        <Input
                          type="text"
                          placeholder="0.00"
                          value={newLevelSalePrice}
                          onChange={(e) => setNewLevelSalePrice(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      {!newMayoristaLevels.some(l => l.name === 'Unidad') && (
                      <div>
                        <Label className="text-[10px]">Stock {newLevelDropdown !== 'Personalizado' && newLevelDropdown ? `(${newLevelDropdown}s)` : ''}</Label>
                        <Input
                          type="text"
                          placeholder="0"
                          value={newLevelStockInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '' || /^\d*$/.test(val)) {
                              setNewLevelStockInput(val);
                            }
                          }}
                          className="h-8 text-xs"
                        />
                      </div>
                      )}
                    </div>
                    <div className="flex justify-end mt-3">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700"
                        disabled={
                          !newLevelDropdown ||
                          newLevelDropdown === 'Unidad'
                            ? (!newLevelPurchasePrice || !newLevelSalePrice || !newLevelStockInput)
                            : newMayoristaLevels.some(l => l.name === 'Unidad')
                              ? (!newLevelContains || !newLevelPurchasePrice || !newLevelSalePrice)
                              : (!newLevelContains || !newLevelPurchasePrice || !newLevelSalePrice || !newLevelStockInput)
                        }
                          onClick={() => {
                            const isUnidad = newLevelDropdown === 'Unidad';
                            const contains = isUnidad ? 1 : parseInt(newLevelContains);
                            if (!isUnidad && (isNaN(contains) || contains <= 0)) {
                              toast({ title: "Contenido no válido", description: "Debe ser mayor a 0", variant: "destructive" });
                              return;
                            }

                            const pPrice = parseFloat(newLevelPurchasePrice);
                            const sPrice = parseFloat(newLevelSalePrice);
                            const hasUnidad = newMayoristaLevels.some(l => l.name === 'Unidad');
                            const stockQty = (isUnidad || !hasUnidad) ? parseInt(newLevelStockInput || '0') : 0;
                            if (isNaN(pPrice) || pPrice < 0 || isNaN(sPrice) || sPrice < 0) {
                              toast({ title: "Precios no válidos", description: "Ingresa precios mayores o iguales a 0", variant: "destructive" });
                              return;
                            }
                            if (pPrice >= sPrice) {
                              toast({ title: "Precios inválidos", description: "El precio de compra debe ser menor al precio de venta", variant: "destructive" });
                              return;
                            }
                            if ((isUnidad || !hasUnidad) && (isNaN(stockQty) || stockQty < 0)) {
                              toast({ title: "Stock no válido", description: "Ingresa un stock válido", variant: "destructive" });
                              return;
                            }
                            const newLvl: SaleLevel = {
                              id: generateId(),
                              name: newLevelDropdown === 'Personalizado' ? newLevelCustomName.trim() : newLevelDropdown,
                              baseUnitsContained: contains,
                              purchasePrice: pPrice,
                              salePrice: sPrice,
                              stock: isUnidad ? stockQty : (newMayoristaLevels.some(l => l.name === 'Unidad') ? 0 : stockQty),
                              initialStock: isUnidad ? stockQty : (newMayoristaLevels.some(l => l.name === 'Unidad') ? 0 : stockQty)
                            };
                            setNewMayoristaLevels([...newMayoristaLevels, newLvl]);
                            setNewLevelDropdown('');
                            setNewLevelCustomName('');
                            setNewLevelContains('');
                            setNewLevelPurchasePrice('');
                            setNewLevelSalePrice('');
                            setNewLevelStockInput('');
                          }}
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Agregar Nivel
                        </Button>
                      </div>
                  </div>
                </div>

                {/* Resumen de Stock */}
                {newMayoristaLevels.length > 0 && (
                  <div className="space-y-4 pt-4">
                    <div className="flex items-center gap-2 border-l-4 border-indigo-600 pl-3">
                      <h3 className="font-bold text-slate-900 text-sm">Resumen de Stock</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(() => {
                        const hasUnidad = newMayoristaLevels.some(l => l.name === 'Unidad');
                        return [...newMayoristaLevels].sort((a, b) => { if (a.name === 'Unidad') return -1; if (b.name === 'Unidad') return 1; return a.baseUnitsContained - b.baseUnitsContained; }).map((lvl, i) => {
                          return (
                            <div key={lvl.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                              <div className="flex justify-between items-center">
                                <div>
                                  <p className="text-sm font-bold text-slate-800">{lvl.name}</p>
                                  <p className="text-xs text-slate-500">
                                    {lvl.baseUnitsContained} unid.{lvl.name !== 'Unidad' ? ` equivale a 1 ${lvl.name.toLowerCase()}` : ''}
                                  </p>
                                </div>
                                <div className="text-right">
                                  {hasUnidad && lvl.name !== 'Unidad' ? (
                                    <p className="text-xs text-slate-400 italic">Stock variable</p>
                                  ) : (
                                    <>
                                      <p className="text-[10px] uppercase tracking-wide text-slate-500">Stock disponible</p>
                                      <p className="text-2xl font-bold text-slate-900">{lvl.stock}</p>
                                      <p className="text-[10px] text-slate-500">{lvl.name}(s)</p>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}
                <div>
                  <Label>Imagen del producto</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setNewProductImage(file);
                        const reader = new FileReader();
                        reader.onloadend = () => setNewProductImagePreview(reader.result as string);
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                  {newProductImagePreview && (
                    <div className="mt-2">
                      <img src={newProductImagePreview} alt="Preview" className="w-full h-32 object-cover rounded-lg border" />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button 
              onClick={() => {
                if (addProductMode === 'unidad') agregarProducto();
                else if (addProductMode === 'peso') agregarProductoPeso();
                else if (addProductMode === 'mayorista') agregarProductoMayorista();
              }}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              disabled={
                addProductMode === 'unidad' ? (!newProduct.name || newProduct.salePrice <= 0 || newProduct.purchasePrice <= 0 || newProduct.stock <= 0) :
                addProductMode === 'peso' ? isWeightFormInvalid :
                addProductMode === 'mayorista' ? isMayoristaFormInvalid : false
              }
            >
              Agregar producto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock History Modal */}
      <Dialog
        open={isStockHistoryModalOpen}
        onOpenChange={(open) => {
          setIsStockHistoryModalOpen(open);
          if (!open) {
            setSelectedStockHistoryProduct(null);
            setIsDeleteStockHistoryOpen(false);
            setShowStockRestockForm(false);
            setStockHistoryRestockQuantity('');
            setSelectedMayoristaRestockLevel('');
            setMayoristaRestockQuantity('');
            setSelectedHistoryLevel('');
          }
        }}
      >
        <DialogContent className="sm:max-w-5xl md:max-w-6xl lg:max-w-7xl">
          <DialogHeader>
            <DialogTitle>Historial de stock</DialogTitle>
            <DialogDescription>
              {currentStockHistoryProduct
                ? `${currentStockHistoryProduct.name} · ${currentStockHistoryProduct.category}`
                : 'Selecciona un producto para ver su historial.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {currentStockHistoryProduct && (
              <div className="space-y-4">
                  {currentStockHistoryProduct.type === 'mayorista' && (currentStockHistoryProduct.saleLevels?.some(l => l.name === 'Unidad')) === false ? (
                  // Modal para productos mayoristas (Modelo B: cada nivel tiene su propio stock)
                  <div className="space-y-4">


                    {/* Botones de filtro por nivel */}
                    <div className="flex flex-wrap justify-between items-end gap-3">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Mostrar historial de:</Label>
                        <div className="flex flex-wrap gap-2">
                        {[...(currentStockHistoryProduct.saleLevels || [])].sort((a, b) => { if (a.name === 'Unidad') return -1; if (b.name === 'Unidad') return 1; return a.baseUnitsContained - b.baseUnitsContained; }).map((level) => (
                          <Button
                            key={level.id}
                            variant={selectedHistoryLevel === level.name ? "default" : "outline"}
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => setSelectedHistoryLevel(level.name)}
                          >
                            {level.name}
                          </Button>
                        ))}
                        </div>
                      </div>
                      {userRole === 'admin' && (
                        <Button
                          variant="outline"
                          className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => setIsDeleteStockHistoryOpen(true)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Eliminar historial
                        </Button>
                      )}
                    </div>

                    {/* Formulario de reposición */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <Button
                        variant="outline"
                        className="border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                        onClick={() => setShowStockRestockForm(!showStockRestockForm)}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Agregar reposición
                      </Button>

                      {showStockRestockForm && (
                        <div className="mt-4 space-y-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Nivel</Label>
                            <div className="flex flex-wrap gap-2">
                              {[...(currentStockHistoryProduct.saleLevels || [])].sort((a, b) => { if (a.name === 'Unidad') return -1; if (b.name === 'Unidad') return 1; return a.baseUnitsContained - b.baseUnitsContained; }).map((level) => (
                                <Button
                                  key={level.id}
                                  variant={selectedMayoristaRestockLevel === level.name ? "default" : "outline"}
                                  className={`${selectedMayoristaRestockLevel === level.name ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-white hover:bg-slate-100'}`}
                                  onClick={() => setSelectedMayoristaRestockLevel(level.name)}
                                >
                                  {level.name}
                                </Button>
                              ))}
                            </div>
                          </div>

                          {selectedMayoristaRestockLevel && (
                            <>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>Stock actual ({selectedMayoristaRestockLevel}s)</Label>
                                  <div className="p-3 bg-slate-100 rounded-lg text-lg font-bold text-slate-700">
                                    {currentStockHistoryProduct.saleLevels?.find(l => l.name === selectedMayoristaRestockLevel)?.stock || 0}
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label>Cantidad a agregar ({selectedMayoristaRestockLevel}s)</Label>
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="0"
                                    value={mayoristaRestockQuantity}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === '' || /^\d*$/.test(val)) {
                                        setMayoristaRestockQuantity(val);
                                      }
                                    }}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Fecha</Label>
                                  <div className="relative">
                                    <Input value={stockHistoryCurrentDate} readOnly className="pr-10 bg-white" />
                                    <Calendar className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
                                  </div>
                                </div>
                              </div>
                              <div className="flex justify-end gap-3">
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    setShowStockRestockForm(false);
                                    setSelectedMayoristaRestockLevel('');
                                    setMayoristaRestockQuantity('');
                                  }}
                                >
                                  Cancelar
                                </Button>
                                <Button
                                  className="bg-slate-900 hover:bg-slate-800 text-white"
                                  onClick={() => {
                                    if (!selectedMayoristaRestockLevel || !mayoristaRestockQuantity) {
                                      toast({ title: "Datos incompletos", description: "Selecciona un nivel y una cantidad", variant: "destructive" });
                                      return;
                                    }

                                    const level = currentStockHistoryProduct.saleLevels?.find(l => l.name === selectedMayoristaRestockLevel);
                                    if (!level) return;

                                    const qty = parseInt(mayoristaRestockQuantity);
                                    if (isNaN(qty) || qty <= 0) {
                                      toast({ title: "Cantidad no válida", variant: "destructive" });
                                      return;
                                    }

                                    const productHistory = stockHistory.filter(item => 
                                      item.productId === currentStockHistoryProduct.id && 
                                      (item.affectedLevelName === selectedMayoristaRestockLevel || 
                                        (item.type === 'initial' && item.levelStockAfter?.[selectedMayoristaRestockLevel]))
                                    ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                                    let newHistoryItems: StockHistoryItem[] = [];

                                    // Find last stock state for this level
                                    let lastLevelStock = 0;
                                    if (productHistory.length > 0) {
                                      const lastEntry = productHistory[productHistory.length - 1];
                                      lastLevelStock = lastEntry.levelStockAfter?.[selectedMayoristaRestockLevel] ?? 0;
                                    }
                                    
                                    // Calculate sales since last entry
                                    const soldSinceLast = Math.max(lastLevelStock - level.stock, 0);

                                    const totalUnits = qty * level.baseUnitsContained;

                                    const updatedProducts = products.map(p => {
                                      if (p.id === currentStockHistoryProduct.id) {
                                        const updatedLevels = p.saleLevels?.map(l => {
                                          if (l.name === level.name) {
                                            const newStock = l.stock + qty;
                                            return { ...l, stock: newStock };
                                          }
                                          return l;
                                        });
                                        const newTotalUnits = (updatedLevels || []).reduce((sum, l) => sum + l.stock * l.baseUnitsContained, 0);
                                        return { ...p, saleLevels: updatedLevels, stock: newTotalUnits };
                                      }
                                      return p;
                                    });
                                    setProducts(updatedProducts);
                                    safeSetItem('pos-products', JSON.stringify(updatedProducts));
    syncProductsToFirestore(updatedProducts);

                                    const levelHasHistory = productHistory.length > 0;
                                    
                                    const updatedProduct = updatedProducts.find(p => p.id === currentStockHistoryProduct.id);
                                    const levelStockAfter = updatedProduct?.saleLevels?.reduce((acc, l) => ({ ...acc, [l.name]: l.stock }), {});
                                    
                                    const descParts: string[] = [];
                                    if (soldSinceLast > 0) descParts.push(`${soldSinceLast} vendidos`);
                                    descParts.push(`+${qty} agregados`);

                                    // Single combined entry: restock + sold info
                                    const restockHistoryItem: StockHistoryItem = {
                                      id: generateId(),
                                      productId: currentStockHistoryProduct.id,
                                      productName: currentStockHistoryProduct.name,
                                      type: levelHasHistory ? 'restock' : 'initial',
                                      quantity: totalUnits,
                                      resultingStock: updatedProduct?.stock ?? currentStockHistoryProduct.stock,
                                      date: new Date().toISOString(),
                                      levelQuantities: { [level.name]: qty + soldSinceLast },
                                      levelDescription: levelHasHistory ? descParts.join(' — ') : 'stock inicial',
                                      affectedLevelName: level.name,
                                      levelQuantity: qty,
                                      levelSoldQuantity: soldSinceLast > 0 ? soldSinceLast : undefined,
                                      levelStockAfter,
                                      isInitial: !levelHasHistory
                                    };
                                    newHistoryItems.push(restockHistoryItem);

                                    const updatedHistory = [...stockHistory, ...newHistoryItems];
                                    setStockHistory(updatedHistory);
                                    safeSetItem('pos-stock-history', JSON.stringify(updatedHistory));
                                    newHistoryItems.forEach(h => addPendingId(PENDING.HISTORY, h.id));
      syncHistoryToFirestore(updatedHistory);

                                    toast({ title: "Reposición guardada", description: `+${qty} ${selectedMayoristaRestockLevel}${qty > 1 ? 's' : ''} agregados` });
                                    setShowStockRestockForm(false);
                                    setSelectedMayoristaRestockLevel('');
                                    setMayoristaRestockQuantity('');
                                  }}
                                >
                                  Guardar
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Tabla de historial */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="p-4 bg-slate-50 border-b border-slate-200">
                        <h3 className="font-bold text-slate-900">
                          {selectedHistoryLevel ? `Historial de ${selectedHistoryLevel}` : 'Historial completo'}
                        </h3>
                      </div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader className="bg-slate-50">
                            <TableRow>
                              <TableHead className="text-[11px] font-bold text-slate-700">Fecha</TableHead>
                              <TableHead className="text-[11px] font-bold text-slate-700">Stock actual</TableHead>
                              <TableHead className="text-[11px] font-bold text-slate-700">Venta</TableHead>
                              <TableHead className="text-[11px] font-bold text-slate-700">Cantidad agregada</TableHead>
                              <TableHead className="text-[11px] font-bold text-slate-700 text-right">Stock resultante</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(() => {
                              const productHistory = [...modalProductHistory]
                                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                              if (!selectedHistoryLevel) {
                                // Vista "Todos" (formato general) - agrupar ventas entre restocks
                                const filteredHistory = productHistory.filter(item =>
                                  (item.type !== 'sale' || item.isSummary) && item.type !== 'price_change'
                                );

                                if (filteredHistory.length === 0) {
                                  return (
                                    <TableRow>
                                      <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                                        No hay registros para este producto.
                                      </TableCell>
                                    </TableRow>
                                  );
                                }

                                const displayRows: Array<{
                                  date: string;
                                  stockActual: number;
                                  soldQuantity: number | null;
                                  addedQuantity: number | null;
                                  resultingStock: number;
                                  isInitial: boolean;
                                  key: string;
                                }> = [];

                                filteredHistory.forEach((item, idx) => {
                                  if (item.type === 'sale' && item.isSummary) return;

                                  if (item.type === 'initial') {
                                    displayRows.push({
                                      key: item.id,
                                      date: item.date,
                                      stockActual: item.quantity,
                                      soldQuantity: null,
                                      addedQuantity: item.quantity,
                                      resultingStock: item.resultingStock,
                                      isInitial: true
                                    });
                                    return;
                                  }

                                  const prevItem = idx > 0 ? filteredHistory[idx - 1] : null;
                                  const matchedSale = prevItem?.type === 'sale' && prevItem.isSummary ? prevItem : null;

                                  displayRows.push({
                                    key: item.id,
                                    date: item.date,
                                    stockActual: item.resultingStock - item.quantity,
                                    soldQuantity: matchedSale?.quantity ?? item.levelSoldQuantity ?? null,
                                    addedQuantity: item.quantity,
                                    resultingStock: item.resultingStock,
                                    isInitial: false
                                  });
                                });

                                return displayRows.slice().reverse().map((row) => (
                                  <TableRow key={row.key}>
                                    <TableCell className="text-sm text-slate-700">
                                      {new Date(row.date).toLocaleDateString('es-PE', {
                                        year: 'numeric', month: 'short', day: 'numeric'
                                      })}
                                    </TableCell>
                                    <TableCell className="text-sm font-bold text-slate-700">
                                      {row.stockActual}
                                    </TableCell>
                                    <TableCell className="text-sm font-bold text-red-600">
                                      {row.soldQuantity === null ? '-' : `-${row.soldQuantity}`}
                                    </TableCell>
                                    <TableCell className="text-sm font-bold text-green-600">
                                      {row.addedQuantity === null
                                        ? '-'
                                        : `+${row.addedQuantity}`}
                                      {row.isInitial && <span className="text-slate-500 font-medium"> (inicial)</span>}
                                    </TableCell>
                                    <TableCell className="text-right text-sm font-bold text-slate-700">
                                      {row.resultingStock}
                                    </TableCell>
                                  </TableRow>
                                ));
                              }

                              // Vista por nivel seleccionado (solo initial y restock, sin ventas individuales)
                              const levelEvents = productHistory.filter(item =>
                                item.type === 'initial' || (item.type === 'restock' && item.affectedLevelName === selectedHistoryLevel)
                              );

                              if (levelEvents.length === 0) {
                                return (
                                  <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                                      No hay registros para {selectedHistoryLevel}.
                                    </TableCell>
                                  </TableRow>
                                );
                              }

                              const displayRows: Array<{
                                id: string;
                                date: string;
                                stockActual: number;
                                soldQuantity: number | null;
                                addedQuantity: number | null;
                                resultingStock: number;
                                isInitial: boolean;
                              }> = [];

                              // Calculate final running stock from current product's level stock!
                              const currentLevel = currentStockHistoryProduct.saleLevels?.find(l => l.name === selectedHistoryLevel);
                              let finalRunningStock = currentLevel?.stock ?? 0;

                              let currentStock = finalRunningStock;

                              // Now process in reverse (newest to oldest)
                              levelEvents.slice().reverse().forEach((item) => {
                                const isInitial = item.type === 'initial';
                                
                                let soldQty: number | null = null;
                                let addedQty: number | null = null;
                                let stockBefore: number;
                                let stockAfter: number;

                                // Calculate stockAfter as currentStock, then work backwards
                                stockAfter = currentStock;
                                
                                if (item.type === 'sale') {
                                  soldQty = item.levelQuantity ?? 0;
                                  stockBefore = stockAfter + soldQty;
                                } else if (item.type === 'restock' || item.type === 'initial') {
                                  addedQty = item.type === 'initial' 
                                    ? (item.levelStockAfter?.[selectedHistoryLevel] ?? (item.levelQuantities?.[selectedHistoryLevel] ?? 0))
                                    : (item.levelQuantity ?? 0);
                                  if (isInitial) {
                                    // Initial: after is addedQty (the initial stock)
                                    stockAfter = addedQty;
                                    stockBefore = 0;
                                  } else {
                                    // Restock: before was stockAfter - addedQty, after is stockAfter
                                    stockBefore = stockAfter - addedQty;
                                    // Combined entry: extract sold quantity from levelSoldQuantity
                                    if (item.levelSoldQuantity !== undefined) {
                                      soldQty = item.levelSoldQuantity;
                                    }
                                  }
                                }
                                
                                // Push this row (newest first, like the general view)
                                displayRows.push({
                                  id: item.id,
                                  date: item.date,
                                  stockActual: isInitial ? addedQty : stockBefore,
                                  soldQuantity: soldQty,
                                  addedQuantity: addedQty,
                                  resultingStock: stockAfter,
                                  isInitial
                                });
                                
                                currentStock = stockBefore;
                              });

                              return displayRows.map((row) => (
                                <TableRow key={row.id}>
                                  <TableCell className="text-sm text-slate-700">
                                    {new Date(row.date).toLocaleDateString('es-PE', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric'
                                    })}
                                  </TableCell>
                                  <TableCell className="text-sm font-bold text-slate-700">
                                    {row.stockActual}
                                  </TableCell>
                                  <TableCell className="text-sm font-bold text-red-600">
                                    {row.soldQuantity === null
                                      ? '-'
                                      : `-${row.soldQuantity}`}
                                  </TableCell>
                                  <TableCell className="text-sm font-bold text-green-600">
                                    {row.addedQuantity === null
                                      ? '-'
                                      : `+${row.addedQuantity}`}
                                    {row.isInitial && <span className="text-slate-500 font-medium"> (inicial)</span>}
                                  </TableCell>
                                  <TableCell className="text-right text-sm font-bold text-slate-700">
                                    {row.resultingStock}
                                  </TableCell>
                                </TableRow>
                              ));
                            })()}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Modal para productos normales (mantenemos el original)
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-4 items-start">
                      {currentStockHistoryProduct.imageUrl && (
                        <div className="flex-shrink-0">
                          <img 
                            src={currentStockHistoryProduct.imageUrl} 
                            alt={currentStockHistoryProduct.name} 
                            className="w-48 h-48 object-cover rounded-xl border border-slate-200" 
                          />
                        </div>
                      )}
                      <div className="flex-1 w-full space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Stock disponible</p>
                            <p className="text-2xl font-black text-slate-900">
                              {currentStockHistoryProduct.type === 'peso'
                                ? formatWeight(currentStockHistoryProduct.stock)
                                : currentStockHistoryProduct.stock}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {(currentStockHistoryProduct.type !== 'mayorista' || (currentStockHistoryProduct.saleLevels?.some(l => l.name === 'Unidad'))) && (
                              <Button
                                variant="outline"
                                className="border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                                onClick={() => setShowStockRestockForm(true)}
                              >
                                <Plus className="w-4 h-4 mr-2" />
                                Agregar reposición
                              </Button>
                            )}
                            {userRole === 'admin' && (
                              <Button
                                variant="outline"
                                className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                                onClick={() => setIsDeleteStockHistoryOpen(true)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Eliminar
                              </Button>
                            )}
                          </div>
                        </div>
                        {currentStockHistoryProduct.type === 'peso' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Precio de Venta por Gramo</p>
                              <p className="text-xl font-bold text-green-600">
                                 S/ {((currentStockHistoryProduct.salePricePerKg || 0) / 1000).toFixed(3)}
                              </p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Precio de Compra por Kg</p>
                              <p className="text-xl font-bold text-indigo-600">
                                S/ {(currentStockHistoryProduct.purchasePrice ?? 0).toFixed(2)}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {showStockRestockForm && (currentStockHistoryProduct.type !== 'mayorista' || (currentStockHistoryProduct.saleLevels?.some(l => l.name === 'Unidad'))) && (
                      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="stockHistoryRestockQuantity">
                              {currentStockHistoryProduct.type === 'peso' ? 'Cantidad (gramos)' : currentStockHistoryProduct.type === 'mayorista' ? 'Cantidad (unidades)' : 'Cantidad'}
                            </Label>
                            <Input
                              id="stockHistoryRestockQuantity"
                              type="number"
                              min="1"
                              placeholder="0"
                              value={stockHistoryRestockQuantity}
                              onChange={(e) => setStockHistoryRestockQuantity(e.target.value)}
                            />
                            {currentStockHistoryProduct.type === 'peso' && (
                              <div className="bg-green-100 px-3 py-2 rounded text-sm font-medium text-green-700 w-full text-center">
                                Conversión<br/>{stockHistoryRestockQuantity ? `${(parseFloat(stockHistoryRestockQuantity) / 1000).toFixed(1)}kg` : '0kg'}
                              </div>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label>Fecha</Label>
                            <div className="relative">
                              <Input value={stockHistoryCurrentDate} readOnly className="pr-10 bg-white" />
                              <Calendar className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-4">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setShowStockRestockForm(false);
                              setStockHistoryRestockQuantity('');
                            }}
                          >
                            Cancelar
                          </Button>
                          <Button className="bg-slate-900 hover:bg-slate-800 text-white" onClick={handleAddStockHistoryRestock}>
                            Guardar
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader className="bg-slate-50">
                          <TableRow>
                            <TableHead className="text-[11px] font-bold text-slate-700">Fecha</TableHead>
                            <TableHead className="text-[11px] font-bold text-slate-700">Stock actual</TableHead>
                            <TableHead className="text-[11px] font-bold text-slate-700">Venta</TableHead>
                            <TableHead className="text-[11px] font-bold text-slate-700">Cantidad agregada</TableHead>
                            <TableHead className="text-[11px] font-bold text-slate-700 text-right">Stock resultante</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {!currentStockHistoryProduct || stockHistoryDisplayRows.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                                No hay registros para este producto.
                              </TableCell>
                            </TableRow>
                          ) : (
                            stockHistoryDisplayRows.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell className="text-sm text-slate-700">
                                  {new Date(item.date).toLocaleDateString('es-PE', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric'
                                  })}
                                </TableCell>
                                <TableCell className="text-sm font-bold text-slate-700">
                                  {currentStockHistoryProduct.type === 'peso'
                                    ? formatWeight(item.stockActual)
                                    : item.stockActual}
                                </TableCell>
                                <TableCell className="text-sm font-bold text-red-600">
                                  {item.soldQuantity === null
                                    ? '-'
                                    : `-${currentStockHistoryProduct.type === 'peso' ? formatWeight(item.soldQuantity) : item.soldQuantity}`}
                                </TableCell>
                                <TableCell className="text-sm font-bold text-green-600">
                                  +{currentStockHistoryProduct.type === 'peso'
                                    ? formatWeight(item.addedQuantity)
                                    : item.addedQuantity}
                                </TableCell>
                                <TableCell className="text-right text-sm font-bold text-slate-700">
                                  {currentStockHistoryProduct.type === 'peso'
                                    ? formatWeight(item.resultingStock)
                                    : item.resultingStock}
                                  {item.isInitial && <span className="text-slate-500 font-medium"> (inicial)</span>}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDeleteStockHistoryOpen}
        onOpenChange={(open) => {
          setIsDeleteStockHistoryOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar historial</DialogTitle>
            <DialogDescription>
              {currentStockHistoryProduct
                ? `Se eliminará el historial de ${currentStockHistoryProduct.name}.`
                : 'Confirma la eliminación del historial.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {currentStockHistoryProduct?.type === 'mayorista' && (currentStockHistoryProduct.saleLevels?.some(l => l.name === 'Unidad')) === false && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Eliminar historial de:</Label>
                <div className="flex flex-wrap gap-2">
                  {[...(currentStockHistoryProduct.saleLevels || [])].sort((a, b) => { if (a.name === 'Unidad') return -1; if (b.name === 'Unidad') return 1; return a.baseUnitsContained - b.baseUnitsContained; }).map((level) => (
                    <Button
                      key={level.id}
                      variant={selectedHistoryLevel === level.name ? "destructive" : "outline"}
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setSelectedHistoryLevel(level.name)}
                    >
                      {level.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsDeleteStockHistoryOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
              if (!currentStockHistoryProduct) return;

              if (await esAdminActual()) {
                  let updatedProducts;
                  let updatedHistory;
                  let deletedIds: string[] = [];
                  
                  if (currentStockHistoryProduct.type === 'mayorista' && selectedHistoryLevel) {
                    // Delete only the selected level's history and recalculate that level's stock
                    deletedIds = stockHistory.filter(item => {
                      if (item.productId !== currentStockHistoryProduct.id) return false;
                      if (item.affectedLevelName === selectedHistoryLevel) return true;
                      if (item.type === 'initial' && item.levelStockAfter && item.levelStockAfter[selectedHistoryLevel]) return true;
                      return false;
                    }).map(item => item.id);
                    updatedHistory = stockHistory.filter(item => !deletedIds.includes(item.id));
                    const lastRemainingLevel = updatedHistory
                      .filter(item => item.productId === currentStockHistoryProduct.id && item.levelStockAfter?.[selectedHistoryLevel] !== undefined)
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                    const newLevelStock = lastRemainingLevel?.levelStockAfter?.[selectedHistoryLevel] ?? 0;
                    updatedProducts = products.map(p =>
                      p.id !== currentStockHistoryProduct.id ? p : {
                        ...p,
                        saleLevels: p.saleLevels?.map(l =>
                          l.name !== selectedHistoryLevel ? l : { ...l, stock: newLevelStock, initialStock: newLevelStock }
                        )
                      }
                    );
                    toast({
                      title: "Historial eliminado",
                      description: `Se eliminó el historial de ${selectedHistoryLevel} de ${currentStockHistoryProduct.name}.`,
                    });
                  } else {
                    // For non-mayorista or no level selected, delete all history and reset stock to 0
                    deletedIds = stockHistory.filter(item => item.productId === currentStockHistoryProduct.id).map(item => item.id);
                    updatedProducts = products.map(p =>
                      p.id !== currentStockHistoryProduct.id ? p : { ...p, stock: 0, initialStock: 0 }
                    );
                    updatedHistory = stockHistory.filter(item => item.productId !== currentStockHistoryProduct.id);
                    toast({
                      title: "Historial eliminado",
                      description: `Se eliminó el historial de ${currentStockHistoryProduct.name}.`,
                    });
                  }

                  await Promise.all(deletedIds.map(id => deleteStockHistoryItem(id).catch(e => console.error('ERROR deleteStockHistoryItem:', e))));
                  deletedIds.forEach(id => removePendingId(PENDING.HISTORY, id));
                  
                  const resetProduct = updatedProducts.find(product => product.id === currentStockHistoryProduct.id) ?? null;
                  
                  setStockHistory(updatedHistory);
                  safeSetItem('pos-stock-history', JSON.stringify(updatedHistory));
      syncHistoryToFirestore(updatedHistory);
                  setSelectedStockHistoryProduct(resetProduct);
                  setInventorySearch('');
                  setShowStockRestockForm(false);
                  setStockHistoryRestockQuantity('');
                  setSelectedMayoristaRestockLevel('');
                  setMayoristaRestockQuantity('');
                  setIsDeleteStockHistoryOpen(false);
                } else {
                  toast({
                    title: "Contraseña incorrecta",
                    description: "La contraseña de administrador no es válida.",
                    variant: "destructive",
                  });
                }
              }}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDeleteSaleOpen}
        onOpenChange={(open) => {
          setIsDeleteSaleOpen(open);
          if (!open) {
            setSaleToDelete(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar venta</DialogTitle>
            <DialogDescription>
              Se eliminará la venta ID: {saleToDelete?.id}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsDeleteSaleOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
              if (!saleToDelete) return;

              if (await esAdminActual()) {
                  try { await deleteSale(saleToDelete.id); } catch (e) { console.error('ERROR deleteSale:', e); }
                  removePendingId(PENDING.SALES, saleToDelete.id);
                  const updatedSales = sales.filter(s => s.id !== saleToDelete.id);
                  setSales(updatedSales);
                  safeSetItem('pos-sales', JSON.stringify(updatedSales));
                  syncSalesToFirestore(updatedSales);
                  toast({
                    title: "Venta eliminada",
                    description: `Venta ID: ${saleToDelete.id} eliminada.`,
                  });
                  setIsDeleteSaleOpen(false);
                  setSaleToDelete(null);
                } else {
                  toast({
                    title: "Contraseña incorrecta",
                    description: "La contraseña de administrador no es válida.",
                    variant: "destructive",
                  });
                }
              }}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDeleteProductConfirmOpen}
        onOpenChange={(open) => {
          setIsDeleteProductConfirmOpen(open);
          if (!open) {
            setProductToDelete(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar producto</DialogTitle>
            <DialogDescription>
              Se eliminará el producto: {productToDelete?.name}. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => {
              setIsDeleteProductConfirmOpen(false);
              setProductToDelete(null);
            }}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDeleteProduct}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isBoletaPreviewOpen} onOpenChange={setIsBoletaPreviewOpen}>
        <DialogContent className="max-w-2xl" style={{ maxHeight: 'none' }}>
          <DialogHeader>
            <DialogTitle className="text-center">Vista previa de Boleta</DialogTitle>
          </DialogHeader>
          {selectedBoletaSale && (
            <div className="space-y-4">
              <div className="bg-white border rounded-lg" style={{ maxWidth: '520px', margin: '0 auto' }}>
                <div
                  dangerouslySetInnerHTML={{ __html: boletaPreviewHTML }}
                  style={{ width: '100%' }}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setIsBoletaPreviewOpen(false)}
                >
                  Cerrar
                </Button>
                <Button
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  onClick={() => {
                    imprimirTicket(selectedBoletaSale);
                    setIsBoletaPreviewOpen(false);
                  }}
                >
                  <span className="mr-2">🖨</span> Imprimir
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configuración de Impresión</DialogTitle>
            <DialogDescription>
              Configura la impresión directa con QZ Tray para tiqueteras térmicas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${qzConnected ? 'bg-green-500 shadow-sm shadow-green-200' : 'bg-slate-300'}`} />
                <div>
                  <p className="text-sm font-medium text-slate-900">QZ Tray</p>
                  <p className="text-xs text-slate-500">{qzConnected ? 'Conectado' : 'No conectado'}</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={probarQZTray}
                disabled={isQzTesting}
              >
                {isQzTesting ? 'Probando...' : 'Probar Conexión'}
              </Button>
            </div>

            {qzConnected && qzPrinters.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Impresora
                </Label>
                <Select value={selectedQzPrinter} onValueChange={setSelectedQzPrinter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una impresora" />
                  </SelectTrigger>
                  <SelectContent>
                    {qzPrinters.map((printer) => (
                      <SelectItem key={printer} value={printer}>{printer}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Separator />

            <div className="space-y-3">
              <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Logo de la Empresa
              </Label>
              {companyLogo && (
                <div className="flex justify-center mb-2">
                  <img
                    src={companyLogo}
                    alt="Logo"
                    className="h-16 object-contain rounded-lg border border-slate-200 p-1"
                  />
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs flex-1"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/png,image/jpeg,image/jpg';
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) {
                        const img = new Image();
                        img.onload = () => {
                          const canvas = document.createElement('canvas');
                          const MAX = 300;
                          let w = img.width, h = img.height;
                          if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } } else { if (h > MAX) { w *= MAX / h; h = MAX; } }
                          canvas.width = w; canvas.height = h;
                          canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
                          const resized = canvas.toDataURL('image/jpeg', 0.8);
                          setCompanyLogo(resized);
                          safeSetItem('pos-company-logo', resized);
                          toast({ title: "Logo actualizado", description: "El logo se guardó correctamente" });
                        };
                        img.src = URL.createObjectURL(file);
                      }
                    };
                    input.click();
                  }}
                >
                  {companyLogo ? 'Cambiar Logo' : 'Subir Logo'}
                </Button>
                {companyLogo && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setCompanyLogo('');
                      try { localStorage.removeItem('pos-company-logo'); } catch {}
                      toast({ title: "Logo eliminado", description: "El logo se ha removido" });
                    }}
                  >
                    Quitar
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Impresión directa</Label>
                <p className="text-xs text-slate-500">
                  {useQzPrint
                    ? 'Al vender imprimirá directo sin diálogo de Chrome'
                    : 'Usa el diálogo de impresión del navegador'}
                </p>
              </div>
              <Button
                variant={useQzPrint ? "default" : "outline"}
                size="sm"
                className={useQzPrint ? "bg-indigo-600 hover:bg-indigo-700" : ""}
                onClick={() => setUseQzPrint(!useQzPrint)}
                disabled={!qzConnected}
              >
                {useQzPrint ? 'Activado' : 'Desactivado'}
              </Button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-amber-800">¿No ves tu impresora?</p>
                  <ul className="text-[11px] text-amber-700 mt-1 space-y-0.5 list-disc list-inside">
                    <li>Descarga e instala QZ Tray desde qz.io</li>
                    <li>Verifica que QZ Tray esté ejecutándose</li>
                    <li>Haz clic en "Probar Conexión"</li>
                  </ul>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-slate-700">
                <CloudUpload className="w-4 h-4 text-indigo-600" />
                <span className="font-semibold text-sm">Sincronización en la Nube</span>
              </div>
              <p className="text-xs text-slate-500">
                Sube todos tus datos locales (productos, ventas, historial, usuarios) a Firebase Firestore para acceder desde cualquier dispositivo.
              </p>
              <Button
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={async () => {
                  const safeJSON = <T,>(key: string, fallback: T[]): T[] => {
                    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
                  };
                  // Leer datos locales (de state o localStorage)
                  const localProducts = products.length > 0 ? products : safeJSON('pos-products', []);
                  const localSales = sales.length > 0 ? sales : safeJSON('pos-sales', []);
                  const localUsers = users.length > 0 ? users : safeJSON('pos-users', []);
                  const localCloses = dailyCloses.length > 0 ? dailyCloses : safeJSON('pos-daily-closes', []);
                  const localHistory = stockHistory.length > 0 ? stockHistory : safeJSON('pos-stock-history', []);
                  
                  // Sync individual por colección: solo empuja lo que no está en Firebase
                  const pushMissing = async <T,>(
                    items: T[],
                    pendingKey: string,
                    getAll: () => Promise<T[]>,
                    create: (id: string, data: unknown) => Promise<unknown>,
                    update?: (id: string, data: unknown) => Promise<unknown>
                  ) => {
                    const fbItems = await getAll().catch(() => null);
                    if (!fbItems) return;
                    const fbIds = new Set(fbItems.map((x: any) => x.id));
                    for (const item of items) {
                      const id = (item as any).id;
                      if (fbIds.has(id)) {
                        if (isPendingId(pendingKey, id) && update) {
                          try { await update(id, stripUndefined(item)); removePendingId(pendingKey, id); } catch (e) { console.error('ERROR pushMissing update:', e); }
                        } else {
                          removePendingId(pendingKey, id);
                        }
                      } else {
                        try { await create(id, stripUndefined(item)); removePendingId(pendingKey, id); } catch (e) { console.error('ERROR pushMissing create:', e); }
                      }
                    }
                  };
                  
                  await Promise.all([
                    pushMissing(localProducts, PENDING.PRODUCTS, getAllProducts, createProduct, updateProduct),
                    pushMissing(localSales, PENDING.SALES, getAllSales, createSale),
                    pushMissing(localUsers, PENDING.USERS, getAllLocalUsers, createLocalUser, updateLocalUser),
                    pushMissing(localCloses, PENDING.CLOSES, getAllDailyCloses, createDailyClose),
                    pushMissing(localHistory, PENDING.HISTORY, getAllStockHistory, createStockHistoryItem),
                  ]);
                  
                  toast({ title: "Datos sincronizados", description: "Todos los datos locales se subieron a la nube exitosamente." });
                  setIsConfigOpen(false);
                }}
              >
                <CloudUpload className="w-4 h-4 mr-2" />
                Subir a la nube
              </Button>
              <Button
                variant="outline"
                className="w-full border-slate-300 text-slate-700 hover:bg-slate-100 mt-2"
                onClick={handleForceSync}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Descargar desde la base de datos
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfigOpen(false)} className="w-full">
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isClearSalesOpen} onOpenChange={(open) => {
        setIsClearSalesOpen(open);
              }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-600" />
                Limpiar Ventas del Día
              </div>
            </DialogTitle>
            <DialogDescription>
              Se eliminarán TODAS las ventas de hoy ({todaysSales.length} ventas).
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsClearSalesOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmClearTodaySales}>
              Limpiar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isStockCriticoOpen} onOpenChange={setIsStockCriticoOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                Stock Crítico
              </div>
            </DialogTitle>
            <DialogDescription>
              Productos con niveles de stock agotado o por debajo del umbral ({STOCK_BAJO_THRESHOLD} unidades).
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {stockCriticoLevels.length === 0 ? (
              <div className="py-8 text-center text-slate-500">
                No hay productos con stock crítico.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Nivel</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockCriticoLevels.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{item.productName}</TableCell>
                      <TableCell>{item.levelName}</TableCell>
                      <TableCell className="text-right">{item.stock}</TableCell>
                      <TableCell className="text-right">
                        {item.stock === 0 ? (
                          <Badge variant="destructive">AGOTADO</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100">BAJO</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      </div>
      </div>
    </>
  );
};

export default Index;
