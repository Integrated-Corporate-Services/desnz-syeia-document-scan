import 'dotenv/config';
console.log('PGHOST:', process.env.PGHOST);
console.log('PGUSER:', process.env.PGUSER);
console.log('PGPASSWORD:', process.env.PGPASSWORD ? '***' + process.env.PGPASSWORD.slice(-3) : 'undefined');
console.log('PGDATABASE:', process.env.PGDATABASE);
