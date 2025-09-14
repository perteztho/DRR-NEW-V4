import React from 'react';
import SupabaseConnectionGuide from '../../components/SupabaseConnectionGuide';
import MigrationRunner from '../../components/MigrationRunner';
import SEOHead from '../../components/SEOHead';

const SupabaseSetup: React.FC = () => {
  return (
    <>
      <SEOHead
        title="Supabase Setup - MDRRMO Admin"
        description="Configure Supabase connection for MDRRMO Pio Duran system"
      />
      
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-6">
          <SupabaseConnectionGuide />
        </div>
      </div>
    </>
  );
};

export default SupabaseSetup;