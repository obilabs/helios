/**
 * Test script to verify S3/MinIO setup and bucket creation
 * Run with: node test-s3-setup.js
 */

const { S3Client, ListBucketsCommand, CreateBucketCommand } = require('@aws-sdk/client-s3');

const config = {
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  accessKey: process.env.S3_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.S3_SECRET_KEY || 'minioadmin123',
  bucketPrivate: process.env.S3_BUCKET_PRIVATE || 'helios-uploads',
  bucketPublic: process.env.S3_BUCKET_PUBLIC || 'helios-public',
  region: process.env.S3_REGION || 'us-east-1',
};

const client = new S3Client({
  endpoint: config.endpoint,
  region: config.region,
  credentials: {
    accessKeyId: config.accessKey,
    secretAccessKey: config.secretKey,
  },
  forcePathStyle: true,
});

async function testS3Setup() {
  console.log('🔧 Testing S3/MinIO Setup...\n');
  console.log('Configuration:');
  console.log(`  Endpoint: ${config.endpoint}`);
  console.log(`  Access Key: ${config.accessKey}`);
  console.log(`  Region: ${config.region}`);
  console.log(`  Private Bucket: ${config.bucketPrivate}`);
  console.log(`  Public Bucket: ${config.bucketPublic}\n`);

  try {
    // List existing buckets
    console.log('📋 Listing existing buckets...');
    const listCommand = new ListBucketsCommand({});
    const { Buckets } = await client.send(listCommand);

    if (Buckets && Buckets.length > 0) {
      console.log(`✅ Found ${Buckets.length} existing bucket(s):`);
      Buckets.forEach(bucket => {
        console.log(`   - ${bucket.Name}`);
      });
    } else {
      console.log('   No buckets found.');
    }

    // Create private bucket if it doesn't exist
    console.log(`\n🪣 Creating private bucket: ${config.bucketPrivate}...`);
    try {
      await client.send(new CreateBucketCommand({ Bucket: config.bucketPrivate }));
      console.log(`✅ Created bucket: ${config.bucketPrivate}`);
    } catch (error) {
      if (error.name === 'BucketAlreadyOwnedByYou' || error.name === 'BucketAlreadyExists') {
        console.log(`✅ Bucket already exists: ${config.bucketPrivate}`);
      } else {
        throw error;
      }
    }

    // Create public bucket if it doesn't exist
    console.log(`\n🪣 Creating public bucket: ${config.bucketPublic}...`);
    try {
      await client.send(new CreateBucketCommand({ Bucket: config.bucketPublic }));
      console.log(`✅ Created bucket: ${config.bucketPublic}`);
    } catch (error) {
      if (error.name === 'BucketAlreadyOwnedByYou' || error.name === 'BucketAlreadyExists') {
        console.log(`✅ Bucket already exists: ${config.bucketPublic}`);
      } else {
        throw error;
      }
    }

    // List buckets again to verify
    console.log('\n📋 Final bucket list:');
    const finalList = await client.send(new ListBucketsCommand({}));
    if (finalList.Buckets) {
      finalList.Buckets.forEach(bucket => {
        console.log(`   ✅ ${bucket.Name}`);
      });
    }

    console.log('\n✨ S3/MinIO setup complete!');
    console.log(`\n🌐 Access MinIO Console: http://localhost:9001`);
    console.log(`   Username: ${config.accessKey}`);
    console.log(`   Password: ${config.secretKey}`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

testS3Setup();
