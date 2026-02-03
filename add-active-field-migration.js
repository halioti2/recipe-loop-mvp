import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addActiveFieldToUserPlaylists() {
  console.log('🔧 ADDING ACTIVE FIELD TO USER_PLAYLISTS TABLE\n');
  
  try {
    // First check if the column already exists
    console.log('1. Checking if active column already exists...');
    const { data: columns, error: columnError } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'user_playlists')
      .eq('column_name', 'active');
      
    if (columnError) {
      console.log('Could not check existing columns, proceeding with migration...');
    } else if (columns && columns.length > 0) {
      console.log('✅ Active column already exists!');
      return;
    }
    
    // Add the active column
    console.log('2. Adding active boolean column with default true...');
    const { error: addColumnError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE user_playlists ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE NOT NULL;'
    });
    
    if (addColumnError) {
      console.error('❌ Error adding column:', addColumnError);
      console.log('\n📋 MANUAL SQL TO RUN IN SUPABASE DASHBOARD:');
      console.log('ALTER TABLE user_playlists ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE NOT NULL;');
      return;
    }
    
    console.log('✅ Active column added successfully!');
    
    // Verify the column was added
    console.log('\n3. Verifying column was added...');
    const { data: userPlaylists, error: verifyError } = await supabase
      .from('user_playlists')
      .select('id, title, active')
      .limit(3);
      
    if (verifyError) {
      console.error('❌ Error verifying column:', verifyError);
    } else {
      console.log('✅ Column verified! Sample records:');
      userPlaylists.forEach(up => {
        console.log(`  ${up.title}: active = ${up.active}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.log('\n📋 MANUAL SQL TO RUN IN SUPABASE DASHBOARD:');
    console.log('-- Add active column to user_playlists');
    console.log('ALTER TABLE user_playlists ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE NOT NULL;');
    console.log('');
    console.log('-- Set all existing playlists as active');
    console.log('UPDATE user_playlists SET active = TRUE WHERE active IS NULL;');
  }
}

addActiveFieldToUserPlaylists().catch(console.error);