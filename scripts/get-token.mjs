import { execSync } from 'child_process';

// Read token from Windows Credential Manager using cmdkey + native API
const result = execSync(
  `powershell -NoProfile -Command "$sig='[DllImport(\\"Advapi32.dll\\",EntryPoint=\\"CredReadW\\",CharSet=CharSet.Unicode,SetLastError=true)]public static extern bool CredRead(string t,int y,int f,out IntPtr p);[StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]public struct CRED{public int A;public int B;public string C;public string D;public long E;public int CredentialBlobSize;public IntPtr CredentialBlob;public int F;public int G;public IntPtr H;public string I;public string J;}'; Add-Type -MemberDefinition $sig -Name Ch -Namespace WC; $p=[IntPtr]::Zero; if([WC.Ch]::CredRead('Supabase CLI:supabase',1,0,[ref]$p)){$c=[System.Runtime.InteropServices.Marshal]::PtrToStructure($p,[WC.Ch+CRED]); $b=New-Object byte[] $c.CredentialBlobSize; [System.Runtime.InteropServices.Marshal]::Copy($c.CredentialBlob,$b,0,$c.CredentialBlobSize); [System.Text.Encoding]::Unicode.GetString($b)}"`,
  { encoding: 'utf8', timeout: 10000 }
).trim();

if (result) {
  console.log(result);
} else {
  console.error('Token not found');
  process.exit(1);
}
