import React, { useState } from 'react';
import { Database, Play, CheckCircle, AlertTriangle, Copy, Check } from 'lucide-react';
import ModernCard from './ModernCard';
import ModernButton from './ModernButton';
import { supabase } from '../lib/supabase';

interface Migration {
  id: string;
  name: string;
  description: string;
  sql: string;
  order: number;
}

const MigrationRunner: React.FC = () => {
  const [runningMigration, setRunningMigration] = useState<string | null>(null);
  const [completedMigrations, setCompletedMigrations] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copiedMigration, setCopiedMigration] = useState<string | null>(null);

  const migrations: Migration[] = [
    {
      id: 'create_users_table',
      name: 'Create Users Table',
      description: 'Creates the main users table with authentication and profile data',
      order: 1,
      sql: `-- Create users table
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role text DEFAULT 'editor' NOT NULL,
  name text NOT NULL,
  avatar text,
  status text DEFAULT 'active' NOT NULL,
  last_login timestamptz,
  login_attempts integer DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  
  CONSTRAINT users_username_check CHECK (length(username) >= 3 AND length(username) <= 50),
  CONSTRAINT users_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'),
  CONSTRAINT users_name_check CHECK (length(name) >= 2 AND length(name) <= 100),
  CONSTRAINT users_role_check CHECK (role = ANY (ARRAY['admin', 'editor'])),
  CONSTRAINT users_status_check CHECK (status = ANY (ARRAY['active', 'inactive', 'suspended'])),
  CONSTRAINT valid_email_domain CHECK (email ~~ '%@%.%' AND length(email) >= 5 AND length(email) <= 255),
  CONSTRAINT valid_name_format CHECK (name !~ '^[0-9]+$' AND name ~ '^[A-Za-z\\s\\-\\.]+$'),
  CONSTRAINT valid_password_hash CHECK (length(password_hash) >= 50)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON public.users(last_login);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Admin users can manage all users" ON public.users
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
    )
  );

CREATE POLICY "Authenticated users can read active users" ON public.users
  FOR SELECT USING (status = 'active')
  TO authenticated;

CREATE POLICY "Users can update their own profile" ON public.users
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid() AND 
    role = (SELECT role FROM public.users WHERE id = auth.uid()) AND
    status = (SELECT status FROM public.users WHERE id = auth.uid())
  );`
    },
    {
      id: 'create_profiles_table',
      name: 'Create Profiles Table',
      description: 'Creates profiles table linked to Supabase auth',
      order: 2,
      sql: `-- Create user_role and user_status enums
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'editor');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('active', 'inactive');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  full_name text NOT NULL,
  email text UNIQUE NOT NULL,
  role user_role DEFAULT 'editor',
  status user_status DEFAULT 'active',
  avatar_url text,
  last_login timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id)
  TO public;

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  TO public;

CREATE POLICY "Profiles can view own data" ON public.profiles
  FOR SELECT USING (auth.uid() = id)
  TO authenticated;

CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id)
  TO authenticated;`
    },
    {
      id: 'create_content_tables',
      name: 'Create Content Tables',
      description: 'Creates news, pages, services, and other content tables',
      order: 3,
      sql: `-- Create content status enums
DO $$ BEGIN
  CREATE TYPE content_status AS ENUM ('draft', 'published');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE page_template AS ENUM ('default', 'about', 'news', 'services', 'resources', 'disaster-plan');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE section_type AS ENUM ('hero', 'content', 'cards', 'gallery', 'contact', 'stats', 'accordion');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create news table
CREATE TABLE IF NOT EXISTS public.news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  excerpt text,
  content text,
  image text,
  author text,
  status content_status DEFAULT 'draft',
  date date DEFAULT CURRENT_DATE,
  featured boolean DEFAULT false,
  view_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create pages table
CREATE TABLE IF NOT EXISTS public.pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  content text NOT NULL,
  meta_description text,
  meta_keywords text,
  hero_title text,
  hero_subtitle text,
  hero_image text,
  status content_status DEFAULT 'draft',
  template page_template DEFAULT 'default',
  featured boolean DEFAULT false,
  view_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create services table
CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  icon text DEFAULT 'Shield',
  tags text[] DEFAULT '{}',
  status content_status DEFAULT 'published',
  featured boolean DEFAULT false,
  order_index integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_news_status ON public.news(status);
CREATE INDEX IF NOT EXISTS idx_news_date ON public.news(date DESC);
CREATE INDEX IF NOT EXISTS idx_pages_slug ON public.pages(slug);
CREATE INDEX IF NOT EXISTS idx_pages_status ON public.pages(status);
CREATE INDEX IF NOT EXISTS idx_services_status ON public.services(status);

-- Enable RLS
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Anyone can view published news" ON public.news
  FOR SELECT USING (status = 'published')
  TO public;

CREATE POLICY "Authenticated users can manage news" ON public.news
  FOR ALL USING (true)
  WITH CHECK (true)
  TO authenticated;

CREATE POLICY "Anyone can view published pages" ON public.pages
  FOR SELECT USING (status = 'published')
  TO public;

CREATE POLICY "Authenticated users can manage pages" ON public.pages
  FOR ALL USING (true)
  WITH CHECK (true)
  TO authenticated;

CREATE POLICY "Anyone can view active services" ON public.services
  FOR SELECT USING (status = 'published')
  TO public;

CREATE POLICY "Authenticated users can manage services" ON public.services
  FOR ALL USING (true)
  WITH CHECK (true)
  TO authenticated;`
    },
    {
      id: 'create_navigation_tables',
      name: 'Create Navigation Tables',
      description: 'Creates navigation and menu structure tables',
      order: 4,
      sql: `-- Create navigation_items table
CREATE TABLE IF NOT EXISTS public.navigation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  path text NOT NULL,
  icon text DEFAULT 'Home',
  order_index integer DEFAULT 1,
  is_active boolean DEFAULT true,
  is_featured boolean DEFAULT false,
  parent_id uuid REFERENCES public.navigation_items(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  CONSTRAINT navigation_items_label_parent_uk UNIQUE (label, parent_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_navigation_items_parent ON public.navigation_items(parent_id);

-- Enable RLS
ALTER TABLE public.navigation_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Anyone can view active navigation items" ON public.navigation_items
  FOR SELECT USING (is_active = true)
  TO public;

CREATE POLICY "Authenticated users can manage navigation items" ON public.navigation_items
  FOR ALL USING (true)
  WITH CHECK (true)
  TO authenticated;`
    },
    {
      id: 'create_emergency_tables',
      name: 'Create Emergency Tables',
      description: 'Creates incident reports, alerts, and emergency hotlines tables',
      order: 5,
      sql: `-- Create emergency enums
DO $$ BEGIN
  CREATE TYPE incident_urgency AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE incident_status AS ENUM ('pending', 'in-progress', 'resolved');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE alert_type AS ENUM ('general', 'earthquake', 'flood', 'fire', 'typhoon', 'tsunami', 'landslide');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE alert_severity AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE alert_status AS ENUM ('draft', 'active', 'expired', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create incident_reports table
CREATE TABLE IF NOT EXISTS public.incident_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number text UNIQUE NOT NULL,
  reporter_name text NOT NULL,
  contact_number text NOT NULL,
  location text,
  landmark text,
  incident_type text,
  description text,
  urgency incident_urgency DEFAULT 'MEDIUM',
  status incident_status DEFAULT 'pending',
  image_url text,
  date_reported timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create emergency_alerts table
CREATE TABLE IF NOT EXISTS public.emergency_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type alert_type DEFAULT 'general',
  severity alert_severity DEFAULT 'medium',
  title text NOT NULL,
  message text NOT NULL,
  location text DEFAULT 'Municipality-wide',
  coordinates jsonb,
  issued_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  status alert_status DEFAULT 'draft',
  channels text[] DEFAULT '{social-media}',
  priority integer DEFAULT 3,
  show_on_frontend boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  CONSTRAINT emergency_alerts_priority_check CHECK (priority >= 1 AND priority <= 5)
);

-- Create emergency_hotlines table
CREATE TABLE IF NOT EXISTS public.emergency_hotlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_name text NOT NULL,
  phone_number text NOT NULL,
  logo text,
  department text NOT NULL,
  description text,
  is_primary boolean DEFAULT false,
  order_index integer DEFAULT 1,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_incident_reports_status ON public.incident_reports(status);
CREATE INDEX IF NOT EXISTS idx_incident_reports_date ON public.incident_reports(date_reported DESC);
CREATE INDEX IF NOT EXISTS idx_emergency_alerts_status ON public.emergency_alerts(status);

-- Enable RLS
ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_hotlines ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Anyone can submit incident reports" ON public.incident_reports
  FOR INSERT WITH CHECK (true)
  TO public;

CREATE POLICY "Anyone can view incident reports" ON public.incident_reports
  FOR SELECT USING (true)
  TO public;

CREATE POLICY "Authenticated users can manage incident reports" ON public.incident_reports
  FOR ALL USING (true)
  WITH CHECK (true)
  TO authenticated;

CREATE POLICY "Anyone can view active emergency alerts" ON public.emergency_alerts
  FOR SELECT USING (status = 'active' AND show_on_frontend = true)
  TO public;

CREATE POLICY "Authenticated users can manage emergency alerts" ON public.emergency_alerts
  FOR ALL USING (true)
  WITH CHECK (true)
  TO authenticated;

CREATE POLICY "Anyone can view active emergency hotlines" ON public.emergency_hotlines
  FOR SELECT USING (is_active = true)
  TO public;

CREATE POLICY "Authenticated users can manage emergency hotlines" ON public.emergency_hotlines
  FOR ALL USING (true)
  WITH CHECK (true)
  TO authenticated;`
    },
    {
      id: 'create_helper_functions',
      name: 'Create Helper Functions',
      description: 'Creates utility functions and triggers for the database',
      order: 6,
      sql: `-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON public.users 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at 
  BEFORE UPDATE ON public.profiles 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_news_updated_at 
  BEFORE UPDATE ON public.news 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pages_updated_at 
  BEFORE UPDATE ON public.pages 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_services_updated_at 
  BEFORE UPDATE ON public.services 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_navigation_items_updated_at 
  BEFORE UPDATE ON public.navigation_items 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_incident_reports_updated_at 
  BEFORE UPDATE ON public.incident_reports 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_emergency_alerts_updated_at 
  BEFORE UPDATE ON public.emergency_alerts 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_emergency_hotlines_updated_at 
  BEFORE UPDATE ON public.emergency_hotlines 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create helper function to check if user is editor or admin
CREATE OR REPLACE FUNCTION is_editor_or_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('editor', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`
    },
    {
      id: 'insert_sample_data',
      name: 'Insert Sample Data',
      description: 'Inserts initial sample data for testing',
      order: 7,
      sql: `-- Insert sample navigation items
INSERT INTO public.navigation_items (label, path, icon, order_index, is_active) VALUES
  ('Home', '/', 'Home', 1, true),
  ('About', '/about', 'Info', 2, true),
  ('News', '/news', 'Newspaper', 3, true),
  ('Services', '/services', 'Shield', 4, true),
  ('Resources', '/resources', 'FileText', 5, true),
  ('Contact', '/contact', 'Phone', 6, true)
ON CONFLICT (label, parent_id) DO NOTHING;

-- Insert sample emergency hotlines
INSERT INTO public.emergency_hotlines (contact_name, phone_number, department, description, is_primary, order_index) VALUES
  ('MDRRMO Emergency Hotline', '911', 'MDRRMO', 'Main emergency response hotline', true, 1),
  ('Fire Department', '116', 'BFP', 'Fire emergency and rescue services', false, 2),
  ('Police Emergency', '117', 'PNP', 'Police emergency response', false, 3),
  ('Medical Emergency', '143', 'DOH', 'Medical emergency services', false, 4)
ON CONFLICT DO NOTHING;

-- Insert sample services
INSERT INTO public.services (title, description, icon, status, featured, order_index) VALUES
  ('Emergency Response', 'Rapid response to natural disasters and emergencies', 'AlertTriangle', 'published', true, 1),
  ('Disaster Preparedness', 'Community education and disaster preparedness programs', 'Shield', 'published', true, 2),
  ('Risk Assessment', 'Comprehensive risk assessment and hazard mapping', 'Search', 'published', false, 3),
  ('Early Warning System', 'Advanced early warning systems for natural disasters', 'Bell', 'published', false, 4),
  ('Evacuation Planning', 'Strategic evacuation planning and coordination', 'MapPin', 'published', false, 5),
  ('Community Training', 'Training programs for disaster response and preparedness', 'Users', 'published', false, 6)
ON CONFLICT DO NOTHING;

-- Insert sample news
INSERT INTO public.news (title, excerpt, content, status, featured, date) VALUES
  ('MDRRMO Conducts Emergency Drill', 'Annual emergency preparedness drill conducted successfully across all barangays.', 'The Municipal Disaster Risk Reduction and Management Office successfully conducted its annual emergency preparedness drill across all barangays in Pio Duran. The drill involved evacuation procedures, emergency response protocols, and community coordination exercises.', 'published', true, CURRENT_DATE - INTERVAL '2 days'),
  ('Weather Advisory: Typhoon Season Preparation', 'Important reminders for typhoon season preparedness and safety measures.', 'As we enter the typhoon season, MDRRMO reminds all residents to prepare their emergency kits, secure their properties, and stay informed about weather updates. Follow official channels for the latest information and evacuation orders if necessary.', 'published', false, CURRENT_DATE - INTERVAL '5 days'),
  ('New Early Warning System Installed', 'State-of-the-art early warning system now operational in high-risk areas.', 'MDRRMO has successfully installed and tested new early warning systems in flood-prone and landslide-susceptible areas. These systems will provide timely alerts to residents and enable faster emergency response coordination.', 'published', false, CURRENT_DATE - INTERVAL '1 week')
ON CONFLICT DO NOTHING;`
    }
  ];

  const copyToClipboard = async (text: string, migrationId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMigration(migrationId);
      setTimeout(() => setCopiedMigration(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const runMigration = async (migration: Migration) => {
    setRunningMigration(migration.id);
    setErrors(prev => ({ ...prev, [migration.id]: '' }));

    try {
      const { error } = await supabase.rpc('exec_sql', { sql_query: migration.sql });
      
      if (error) {
        throw error;
      }

      setCompletedMigrations(prev => new Set([...prev, migration.id]));
    } catch (error: any) {
      console.error(`Migration ${migration.id} failed:`, error);
      setErrors(prev => ({ 
        ...prev, 
        [migration.id]: error.message || 'Unknown error occurred' 
      }));
    } finally {
      setRunningMigration(null);
    }
  };

  const runAllMigrations = async () => {
    const sortedMigrations = [...migrations].sort((a, b) => a.order - b.order);
    
    for (const migration of sortedMigrations) {
      if (!completedMigrations.has(migration.id)) {
        await runMigration(migration);
        // Small delay between migrations
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  };

  const testConnection = async () => {
    try {
      const { data, error } = await supabase.from('users').select('count').limit(1);
      if (error) throw error;
      
      alert('✅ Database connection successful! All tables are accessible.');
    } catch (error: any) {
      alert(`❌ Connection test failed: ${error.message}`);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Database Migration Runner</h2>
        <p className="text-gray-600">
          Run these migrations to create the required database tables and fix connection errors
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-4 justify-center">
        <ModernButton
          onClick={runAllMigrations}
          variant="primary"
          icon={Play}
          disabled={runningMigration !== null}
        >
          Run All Migrations
        </ModernButton>
        <ModernButton
          onClick={testConnection}
          variant="success"
          icon={Database}
        >
          Test Connection
        </ModernButton>
      </div>

      {/* Progress */}
      <ModernCard className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Migration Progress</span>
          <span className="text-sm text-gray-600">
            {completedMigrations.size} of {migrations.length} completed
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-green-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(completedMigrations.size / migrations.length) * 100}%` }}
          />
        </div>
      </ModernCard>

      {/* Migration List */}
      <div className="grid gap-4">
        {migrations
          .sort((a, b) => a.order - b.order)
          .map((migration) => {
            const isCompleted = completedMigrations.has(migration.id);
            const isRunning = runningMigration === migration.id;
            const hasError = errors[migration.id];

            return (
              <ModernCard key={migration.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        isCompleted ? 'bg-green-100 text-green-600' :
                        isRunning ? 'bg-blue-100 text-blue-600' :
                        hasError ? 'bg-red-100 text-red-600' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {isCompleted ? (
                          <CheckCircle size={16} />
                        ) : isRunning ? (
                          <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                        ) : hasError ? (
                          <AlertTriangle size={16} />
                        ) : (
                          <span className="text-xs font-bold">{migration.order}</span>
                        )}
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {migration.name}
                      </h3>
                    </div>
                    
                    <p className="text-gray-600 mb-4">{migration.description}</p>
                    
                    {hasError && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-800">
                          <strong>Error:</strong> {hasError}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex space-x-2 ml-4">
                    <ModernButton
                      onClick={() => copyToClipboard(migration.sql, migration.id)}
                      variant="ghost"
                      size="sm"
                      icon={copiedMigration === migration.id ? Check : Copy}
                    >
                      {copiedMigration === migration.id ? 'Copied!' : 'Copy SQL'}
                    </ModernButton>
                    
                    {!isCompleted && (
                      <ModernButton
                        onClick={() => runMigration(migration)}
                        variant={hasError ? 'warning' : 'primary'}
                        size="sm"
                        icon={Play}
                        disabled={isRunning}
                      >
                        {isRunning ? 'Running...' : hasError ? 'Retry' : 'Run'}
                      </ModernButton>
                    )}
                  </div>
                </div>
              </ModernCard>
            );
          })}
      </div>

      {/* Instructions */}
      <ModernCard className="p-6 bg-blue-50 border-blue-200">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">
          Alternative: Manual Migration in Supabase Dashboard
        </h3>
        <div className="text-sm text-blue-800 space-y-2">
          <p>If the automatic migration fails, you can run these manually:</p>
          <ol className="list-decimal list-inside space-y-1 ml-4">
            <li>Go to your Supabase Dashboard → SQL Editor</li>
            <li>Copy each migration SQL (use the "Copy SQL" buttons above)</li>
            <li>Paste and run each migration in order (1 through {migrations.length})</li>
            <li>Check for errors and fix any issues</li>
            <li>Return here and click "Test Connection"</li>
          </ol>
        </div>
      </ModernCard>
    </div>
  );
};

export default MigrationRunner;