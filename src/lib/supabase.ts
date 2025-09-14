import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate environment variables
const validateEnvironment = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables. Please check your .env file.');
    console.error('VITE_SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing');
    console.error('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'Set' : 'Missing');
    return false;
  }
  
  if (supabaseUrl.includes('your-project-ref') || supabaseAnonKey.includes('your-anon-key')) {
    console.error('Supabase environment variables contain placeholder values');
    return false;
  }
  
  return true;
};

// Create Supabase client with enhanced configuration
export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    },
    heartbeatIntervalMs: 30000,
    reconnectAfterMs: (tries: number) => Math.min(tries * 1000, 30000)
  },
  global: {
    headers: {
      'x-application-name': 'mdrrmo-pio-duran'
    }
  },
  db: {
    schema: 'public'
  }
  }
);

// Connection state management
let isConnected = false;
let connectionRetries = 0;
const maxRetries = 3;
const baseRetryDelay = 1000;
let reconnectTimeout: NodeJS.Timeout | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;

// Enhanced connection testing with retry logic
const testConnection = async (retryCount = 0): Promise<boolean> => {
  try {
    if (!validateEnvironment()) {
      console.warn('⚠️ Supabase not configured - running in offline mode');
      return false;
    }

    // Clear any existing reconnect timeout
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    const { data, error } = await supabase
      .from('news')
      .select('count')
      .limit(1);

    if (error) {
      throw error;
    }

    isConnected = true;
    connectionRetries = 0;
    console.log('✅ Supabase connection established');
    
    // Dispatch custom event for connection status
    window.dispatchEvent(new CustomEvent('supabase-connected', { detail: { connected: true } }));
    
    // Start heartbeat monitoring
    startHeartbeat();
    
    return true;
  } catch (error) {
    console.error(`❌ Supabase connection failed (attempt ${retryCount + 1}):`, error);
    isConnected = false;
    
    // Retry connection with exponential backoff
    if (retryCount < maxRetries) {
      connectionRetries = retryCount + 1;
      const delay = baseRetryDelay * Math.pow(2, retryCount);
      
      console.log(`🔄 Retrying connection in ${delay}ms...`);
      
      reconnectTimeout = setTimeout(() => {
        testConnection(retryCount + 1);
      }, delay);
    } else {
      console.warn('⚠️ Max connection retries reached - running in offline mode');
      window.dispatchEvent(new CustomEvent('supabase-disconnected', { detail: { connected: false } }));
      connectionRetries = 0; // Reset for future attempts
    }
    
    return false;
  }
};

// Heartbeat monitoring to detect connection drops
const startHeartbeat = () => {
  // Clear existing heartbeat
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  heartbeatInterval = setInterval(async () => {
    if (isConnected && navigator.onLine) {
      try {
        let controller: AbortController | undefined;
        let timeoutId: NodeJS.Timeout;
        
        try {
          controller = new AbortController();
          timeoutId = setTimeout(() => {
            if (controller && !controller.signal.aborted) {
              controller.abort();
            }
          }, 5000);

          const { error } = await supabase
            .from('news')
            .select('count')
            .limit(1)
            .abortSignal(controller.signal);

          clearTimeout(timeoutId);

          if (error) {
            throw error;
          }
        } catch (fetchError) {
          clearTimeout(timeoutId);
          throw fetchError;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn('💔 Heartbeat failed, connection lost:', errorMessage);
        isConnected = false;
        window.dispatchEvent(new CustomEvent('supabase-disconnected', { detail: { connected: false } }));
        
        // Attempt to reconnect
        setTimeout(() => {
          if (!isConnected) {
            testConnection();
          }
        }, 2000);
      }
    }
  }, 15000); // Check every 15 seconds
};

const stopHeartbeat = () => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
};

export const testConnection = async (): Promise<{ success: boolean; message: string }> => {
  try {
    // Test basic connection with a simple query
    const { data, error } = await supabase
      .from('profiles')
      .select('count')
      .limit(1);
    
    if (error) {
      // If profiles table doesn't exist, try a different approach
      if (error.code === '42P01') {
        // Try to check if we can connect to Supabase at all
        const { data: authData, error: authError } = await supabase.auth.getSession();
        if (authError) {
          throw new Error(`Supabase connection failed: ${authError.message}`);
        }
        throw new Error('Database tables not found. Please run the database migrations first.');
      }
      throw new Error(`Database query failed: ${error.message}`);
    }

    return {
      success: true,
      message: 'Successfully connected to Supabase'
    };
  } catch (error: any) {
    console.error('❌ Supabase connection failed (attempt 2):', error.message);
    return {
      success: false,
      message: `Connection failed: ${error.message}. ${error.message.includes('does not exist') ? 'Run database migrations to create required tables.' : ''}`
    };
  }
};

// Initialize connection
testConnection();

// Handle network status changes
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('🌐 Network connection restored');
    connectionRetries = 0; // Reset retry count
    testConnection();
  });
  
  window.addEventListener('offline', () => {
    console.log('📡 Network connection lost');
    isConnected = false;
    stopHeartbeat();
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    window.dispatchEvent(new CustomEvent('supabase-disconnected', { detail: { connected: false } }));
  });

  // Handle page visibility changes
  window.addEventListener('visibilitychange', () => {
    if (!document.hidden && !isConnected && navigator.onLine) {
      console.log('👁️ Page became visible, checking connection');
      testConnection();
    }
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    stopHeartbeat();
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
  });
}

// Export connection utilities
export const getConnectionStatus = () => isConnected;
export const forceReconnect = () => {
  connectionRetries = 0;
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  return testConnection();
};
export const getRetryCount = () => connectionRetries;

// Type aliases for union types
export type NewsStatus = 'published' | 'draft';
export type ServiceStatus = 'active' | 'inactive';
export type IncidentUrgency = 'LOW' | 'MEDIUM' | 'HIGH';
export type IncidentStatus = 'pending' | 'in-progress' | 'resolved';
export type UserRole = 'admin' | 'editor';
export type UserStatus = 'active' | 'inactive';
export type WeatherCondition = 'sunny' | 'cloudy' | 'rainy' | 'stormy';
export type ContentStatus = 'published' | 'draft';

// Type for system settings value
export type SettingValue = string | number | boolean | object | null;

// Database types
export interface Database {
  public: {
    Tables: {
      news: {
        Row: {
          id: string
          title: string
          excerpt: string | null
          content: string | null
          image: string | null
          author: string | null
          status: NewsStatus
          date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          excerpt?: string | null
          content?: string | null
          image?: string | null
          author?: string | null
          status?: NewsStatus
          date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          excerpt?: string | null
          content?: string | null
          image?: string | null
          author?: string | null
          status?: NewsStatus
          date?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      services: {
        Row: {
          id: string
          title: string
          description: string | null
          icon: string | null
          tags: string[] | null
          status: ServiceStatus
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          icon?: string | null
          tags?: string[] | null
          status?: ServiceStatus
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          icon?: string | null
          tags?: string[] | null
          status?: ServiceStatus
          created_at?: string
          updated_at?: string
        }
      }
      incident_reports: {
        Row: {
          id: string
          reference_number: string
          reporter_name: string
          contact_number: string
          location: string | null
          incident_type: string | null
          description: string | null
          urgency: IncidentUrgency
          status: IncidentStatus
          date_reported: string
          image_url: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          reference_number: string
          reporter_name: string
          contact_number: string
          location?: string | null
          incident_type?: string | null
          description?: string | null
          urgency?: IncidentUrgency
          status?: IncidentStatus
          date_reported?: string
          image_url?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          reference_number?: string
          reporter_name?: string
          contact_number?: string
          location?: string | null
          incident_type?: string | null
          description?: string | null
          urgency?: IncidentUrgency
          status?: IncidentStatus
          date_reported?: string
          image_url?: string | null
          updated_at?: string
        }
      }
      gallery: {
        Row: {
          id: string
          title: string
          description: string | null
          image: string | null
          category: string | null
          date: string | null
          location: string | null
          tags: string[] | null
          status: ContentStatus
          featured: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          image?: string | null
          category?: string | null
          date?: string | null
          location?: string | null
          tags?: string[] | null
          status?: ContentStatus
          featured?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          image?: string | null
          category?: string | null
          date?: string | null
          location?: string | null
          tags?: string[] | null
          status?: ContentStatus
          featured?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      users: {
        Row: {
          id: string
          username: string
          email: string
          password_hash: string
          role: UserRole
          name: string
          avatar: string | null
          status: UserStatus
          last_login: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          username: string
          email: string
          password_hash: string
          role?: UserRole
          name: string
          avatar?: string | null
          status?: UserStatus
          last_login?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          email?: string
          password_hash?: string
          role?: UserRole
          name?: string
          avatar?: string | null
          status?: UserStatus
          last_login?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      system_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: SettingValue
          setting_type: string
          description: string | null
          is_public: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value: SettingValue
          setting_type?: string
          description?: string | null
          is_public?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: SettingValue
          setting_type?: string
          description?: string | null
          is_public?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      organizational_hierarchy: {
        Row: {
          id: string
          name: string
          designation: string
          photo: string | null
          department: string
          level: number
          parent_id: string | null
          order_index: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          designation: string
          photo?: string | null
          department: string
          level?: number
          parent_id?: string | null
          order_index?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          designation?: string
          photo?: string | null
          department?: string
          level?: number
          parent_id?: string | null
          order_index?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      key_personnel: {
        Row: {
          id: string
          name: string
          designation: string
          photo: string | null
          bio: string | null
          email: string | null
          phone: string | null
          department: string
          order_index: number
          is_featured: boolean
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          designation: string
          photo?: string | null
          bio?: string | null
          email?: string | null
          phone?: string | null
          department: string
          order_index?: number
          is_featured?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          designation?: string
          photo?: string | null
          bio?: string | null
          email?: string | null
          phone?: string | null
          department?: string
          order_index?: number
          is_featured?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      emergency_hotlines: {
        Row: {
          id: string
          contact_name: string
          phone_number: string
          logo: string | null
          department: string
          description: string | null
          is_primary: boolean
          order_index: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          contact_name: string
          phone_number: string
          logo?: string | null
          department: string
          description?: string | null
          is_primary?: boolean
          order_index?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          contact_name?: string
          phone_number?: string
          logo?: string | null
          department?: string
          description?: string | null
          is_primary?: boolean
          order_index?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      weather_data: {
        Row: {
          id: string
          temperature: number
          humidity: number
          wind_speed: number
          visibility: number
          condition: WeatherCondition
          description: string
          location: string
          alerts: string[]
          last_updated: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          temperature: number
          humidity: number
          wind_speed: number
          visibility?: number
          condition: WeatherCondition
          description: string
          location?: string
          alerts?: string[]
          last_updated?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          temperature?: number
          humidity?: number
          wind_speed?: number
          visibility?: number
          condition?: WeatherCondition
          description?: string
          location?: string
          alerts?: string[]
          last_updated?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      navigation_items: {
        Row: {
          id: string
          label: string
          path: string
          icon: string
          order_index: number
          is_active: boolean
          is_featured: boolean
          parent_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          label: string
          path: string
          icon?: string
          order_index?: number
          is_active?: boolean
          is_featured?: boolean
          parent_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          label?: string
          path?: string
          icon?: string
          order_index?: number
          is_active?: boolean
          is_featured?: boolean
          parent_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      videos: {
        Row: {
          id: string
          title: string
          description: string | null
          video_url: string
          thumbnail: string
          category: string | null
          date: string | null
          location: string | null
          duration: string | null
          tags: string[] | null
          status: ContentStatus
          featured: boolean
          view_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          video_url: string
          thumbnail: string
          category?: string | null
          date?: string | null
          location?: string | null
          duration?: string | null
          tags?: string[] | null
          status?: ContentStatus
          featured?: boolean
          view_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          video_url?: string
          thumbnail?: string
          category?: string | null
          date?: string | null
          location?: string | null
          duration?: string | null
          tags?: string[] | null
          status?: ContentStatus
          featured?: boolean
          view_count?: number
          created_at?: string
          updated_at?: string
        }
      }
      weather_api_settings: {
        Row: {
          id: string
          api_key: string
          api_secret?: string
          station_id?: string
          is_active: boolean
          last_sync: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          api_key: string
          api_secret?: string
          station_id?: string
          is_active?: boolean
          last_sync?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          api_key?: string
          api_secret?: string
          station_id?: string
          is_active?: boolean
          last_sync?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      weather_forecast: {
        Row: {
          id: string
          date: string
          temperature_high: number
          temperature_low: number
          condition: string
          humidity: number
          wind_speed: number
          precipitation: number
          icon: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          date: string
          temperature_high: number
          temperature_low: number
          condition: string
          humidity?: number
          wind_speed?: number
          precipitation?: number
          icon?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          date?: string
          temperature_high?: number
          temperature_low?: number
          condition?: string
          humidity?: number
          wind_speed?: number
          precipitation?: number
          icon?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}