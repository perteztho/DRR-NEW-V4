import React, { useState } from 'react';
import { 
  Database, 
  ExternalLink, 
  Copy, 
  Check, 
  AlertTriangle, 
  CheckCircle,
  ArrowRight,
  Code,
  Settings,
  Play
} from 'lucide-react';
import ModernCard from './ModernCard';
import ModernButton from './ModernButton';
import MigrationRunner from './MigrationRunner';

const SupabaseConnectionGuide: React.FC = () => {
  const [copiedStep, setCopiedStep] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [showMigrationRunner, setShowMigrationRunner] = useState(false);

  const copyToClipboard = async (text: string, stepId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStep(stepId);
      setTimeout(() => setCopiedStep(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const markStepComplete = (stepId: string) => {
    setCompletedSteps(prev => new Set([...prev, stepId]));
  };

  const setupSteps = [
    {
      id: 'create-project',
      title: 'Create Supabase Project',
      description: 'Set up your Supabase project and database',
      icon: Database,
      color: 'bg-blue-500',
      actions: [
        'Go to supabase.com and sign in',
        'Click "New Project"',
        'Name: mdrrmo-pio-duran',
        'Choose Southeast Asia region',
        'Set a strong database password',
        'Wait for project creation (2-3 minutes)'
      ]
    },
    {
      id: 'get-credentials',
      title: 'Get API Credentials',
      description: 'Copy your project URL and anon key',
      icon: Settings,
      color: 'bg-green-500',
      actions: [
        'Go to Settings → API in your Supabase dashboard',
        'Copy Project URL (https://xxxxx.supabase.co)',
        'Copy Anon/Public Key (starts with eyJ...)',
        'Keep these credentials secure'
      ]
    },
    {
      id: 'update-env',
      title: 'Update Environment Variables',
      description: 'Configure your local environment',
      icon: Code,
      color: 'bg-purple-500',
      actions: [
        'Open .env file in project root',
        'Replace VITE_SUPABASE_URL with your project URL',
        'Replace VITE_SUPABASE_ANON_KEY with your anon key',
        'Save the file'
      ],
      copyable: `VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here`
    },
    {
      id: 'run-migrations',
      title: 'Run Database Migrations',
      description: 'Set up database tables and security',
      icon: Database,
      color: 'bg-orange-500',
      actions: [
        'Go to SQL Editor in Supabase dashboard',
        'Copy migration files from supabase/migrations/',
        'Run each migration file in chronological order',
        'Verify tables are created successfully'
      ]
    },
    {
      id: 'test-connection',
      title: 'Test Connection',
      description: 'Verify everything is working',
      icon: Play,
      color: 'bg-indigo-500',
      actions: [
        'Restart development server (npm run dev)',
        'Go to Admin → Settings → Database',
        'Click "Test Connection"',
        'Login with admin@mdrrmo.gov.ph / admin123',
        'Create test content to verify functionality'
      ]
    }
  ];

  const envTemplate = `# Supabase Configuration
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Application Configuration
VITE_APP_NAME=MDRRMO Pio Duran
VITE_APP_VERSION=2.0.0`;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Supabase Connection Setup</h1>
        <p className="text-lg text-gray-600">
          Follow these steps to connect your MDRRMO system to Supabase for online functionality
        </p>
      </div>

      {/* Progress Indicator */}
      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Setup Progress</h3>
          <span className="text-sm text-gray-600">
            {completedSteps.size} of {setupSteps.length} completed
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(completedSteps.size / setupSteps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Migration Runner Section */}
      <ModernCard className="p-6 bg-red-50 border-red-200">
        <div className="flex items-start space-x-4">
          <AlertTriangle className="text-red-600 flex-shrink-0 mt-1" size={24} />
          <div className="flex-1">
            <h3 className="text-lg font-bold text-red-900 mb-2">
              Database Tables Missing?
            </h3>
            <p className="text-red-800 mb-4">
              If you're seeing "relation does not exist" errors, your database tables haven't been created yet. 
              Use the migration runner below to automatically create all required tables.
            </p>
            <ModernButton
              onClick={() => setShowMigrationRunner(!showMigrationRunner)}
              variant="warning"
              icon={Database}
            >
              {showMigrationRunner ? 'Hide' : 'Show'} Migration Runner
            </ModernButton>
          </div>
        </div>
      </ModernCard>

      {showMigrationRunner && (
        <ModernCard className="p-6">
          <MigrationRunner />
        </ModernCard>
      )}

      {/* Setup Steps */}
      <div className="space-y-6">
        {setupSteps.map((step, index) => {
          const isCompleted = completedSteps.has(step.id);
          const StepIcon = step.icon;
          
          return (
            <ModernCard key={step.id} variant="interactive" className="overflow-hidden">
              <div className="p-6">
                <div className="flex items-start space-x-4">
                  <div className={`w-12 h-12 ${step.color} rounded-lg flex items-center justify-center flex-shrink-0`}>
                    {isCompleted ? (
                      <CheckCircle className="text-white" size={24} />
                    ) : (
                      <StepIcon className="text-white" size={24} />
                    )}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xl font-bold text-gray-900">
                        Step {index + 1}: {step.title}
                      </h3>
                      {!isCompleted && (
                        <ModernButton
                          onClick={() => markStepComplete(step.id)}
                          variant="success"
                          size="sm"
                          icon={CheckCircle}
                        >
                          Mark Complete
                        </ModernButton>
                      )}
                    </div>
                    
                    <p className="text-gray-600 mb-4">{step.description}</p>
                    
                    <div className="space-y-2">
                      {step.actions.map((action, actionIndex) => (
                        <div key={actionIndex} className="flex items-start space-x-2">
                          <span className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0 mt-0.5">
                            {actionIndex + 1}
                          </span>
                          <span className="text-gray-700">{action}</span>
                        </div>
                      ))}
                    </div>
                    
                    {step.copyable && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700">Environment Variables Template</span>
                          <ModernButton
                            onClick={() => copyToClipboard(step.copyable!, step.id)}
                            variant="ghost"
                            size="sm"
                            icon={copiedStep === step.id ? Check : Copy}
                          >
                            {copiedStep === step.id ? 'Copied!' : 'Copy'}
                          </ModernButton>
                        </div>
                        <pre className="text-sm text-gray-800 overflow-x-auto">
                          <code>{step.copyable}</code>
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </ModernCard>
          );
        })}
      </div>

      {/* Quick Links */}
      <ModernCard variant="gradient" className="p-8 text-center">
        <h3 className="text-2xl font-bold text-blue-950 mb-4">Quick Links</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ModernButton
            onClick={() => window.open('https://supabase.com/dashboard', '_blank')}
            variant="primary"
            icon={ExternalLink}
            className="w-full"
          >
            Supabase Dashboard
          </ModernButton>
          <ModernButton
            onClick={() => window.open('https://supabase.com/docs', '_blank')}
            variant="secondary"
            icon={ExternalLink}
            className="w-full"
          >
            Documentation
          </ModernButton>
          <ModernButton
            onClick={() => window.open('/admin/settings', '_self')}
            variant="warning"
            icon={Settings}
            className="w-full"
          >
            Test Connection
          </ModernButton>
        </div>
      </ModernCard>

      {/* Troubleshooting */}
      <ModernCard className="p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
          <AlertTriangle className="text-yellow-500 mr-2" size={20} />
          Common Issues
        </h3>
        
        <div className="space-y-4">
          <div className="border-l-4 border-red-500 pl-4">
            <h4 className="font-semibold text-red-800">Connection Failed</h4>
            <p className="text-sm text-red-700">
              Check that your Supabase project is active and credentials are correct
            </p>
          </div>
          
          <div className="border-l-4 border-yellow-500 pl-4">
            <h4 className="font-semibold text-yellow-800">Tables Missing</h4>
            <p className="text-sm text-yellow-700">
              Run all migration files in the SQL Editor to create required tables
            </p>
          </div>
          
          <div className="border-l-4 border-blue-500 pl-4">
            <h4 className="font-semibold text-blue-800">Authentication Issues</h4>
            <p className="text-sm text-blue-700">
              Ensure RLS policies are created and demo users exist
            </p>
          </div>
        </div>
      </ModernCard>
    </div>
  );
};

export default SupabaseConnectionGuide;