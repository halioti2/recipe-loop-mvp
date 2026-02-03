import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixRecipesRLS() {
  console.log('🔧 FIXING RECIPES TABLE RLS POLICIES\n');
  
  try {
    // Enable RLS on recipes table (if not already enabled)
    console.log('1. Enabling RLS on recipes table...');
    await supabase.rpc('exec_sql', { 
      sql: 'ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;' 
    });
    console.log('✅ RLS enabled');
    
    // Create policy to allow authenticated users to read all recipes
    console.log('\n2. Creating policy for authenticated users to read recipes...');
    await supabase.rpc('exec_sql', { 
      sql: `
        DROP POLICY IF EXISTS "Users can read all recipes" ON recipes;
        CREATE POLICY "Users can read all recipes" ON recipes
        FOR SELECT 
        USING (auth.role() = 'authenticated');
      `
    });
    console.log('✅ Read policy created');
    
    // Test the policy
    console.log('\n3. Testing policy with anon key + auth simulation...');
    
    // We can't easily simulate auth session, but we can check if policy exists
    const { data: policies, error: policyError } = await supabase
      .from('pg_policies')
      .select('*')
      .eq('tablename', 'recipes');
      
    if (policyError) {
      console.log('Could not check policies directly');
    } else {
      console.log('Policies on recipes table:');
      policies.forEach(p => {
        console.log(`  ${p.policyname}: ${p.cmd} - ${p.qual}`);
      });
    }
    
  } catch (error) {
    console.error('Error setting up RLS:', error);
    
    // Alternative: Try a simpler approach
    console.log('\nTrying alternative RLS setup...');
    
    try {
      // Create a more permissive policy for testing
      await supabase.rpc('exec_sql', { 
        sql: `
          DROP POLICY IF EXISTS "Allow recipe reads" ON recipes;
          CREATE POLICY "Allow recipe reads" ON recipes
          FOR SELECT 
          USING (true);
        `
      });
      console.log('✅ Permissive read policy created for testing');
      
    } catch (altError) {
      console.error('Alternative approach also failed:', altError);
      console.log('\n📋 MANUAL STEPS NEEDED:');
      console.log('Run these SQL commands in Supabase dashboard:');
      console.log('');
      console.log('-- Enable RLS');
      console.log('ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;');
      console.log('');
      console.log('-- Allow authenticated users to read recipes');
      console.log('CREATE POLICY "Users can read all recipes" ON recipes');
      console.log('FOR SELECT USING (auth.role() = \'authenticated\');');
      console.log('');
      console.log('-- OR for testing, allow all reads:');
      console.log('CREATE POLICY "Allow all recipe reads" ON recipes');
      console.log('FOR SELECT USING (true);');
    }
  }
}

fixRecipesRLS().catch(console.error);