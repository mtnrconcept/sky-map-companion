Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class CredMan {
    [DllImport("Advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern bool CredRead(string target, int type, int flags, out IntPtr credPtr);

    [DllImport("Advapi32.dll", EntryPoint="CredFree", SetLastError=true)]
    public static extern bool CredFree(IntPtr cred);
}
"@

$ptr = [IntPtr]::Zero
$ok = [CredMan]::CredRead("Supabase CLI:supabase", 1, 0, [ref]$ptr)
if (-not $ok) {
    Write-Error "Credential not found"
    exit 1
}

# CREDENTIAL struct offsets (x64):
# 0  Flags (4)
# 4  Type (4)
# 8  TargetName ptr (8)
# 16 Comment ptr (8)
# 24 LastWritten (8)
# 32 CredentialBlobSize (4)
# 36 padding (4)
# 40 CredentialBlob ptr (8)

$blobSize = [System.Runtime.InteropServices.Marshal]::ReadInt32($ptr, 32)
$blobPtr  = [System.Runtime.InteropServices.Marshal]::ReadIntPtr($ptr, 40)
$bytes    = New-Object byte[] $blobSize
[System.Runtime.InteropServices.Marshal]::Copy($blobPtr, $bytes, 0, $blobSize)
$token = [System.Text.Encoding]::UTF8.GetString($bytes)
[CredMan]::CredFree($ptr) | Out-Null
Write-Output $token
