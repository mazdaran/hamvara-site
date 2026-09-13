# Encrypted source backup runbook

This workflow creates a complete Git bundle for `mazdaran/hamvara-site`,
encrypts it before storage, and retains it as a GitHub Actions artifact for 90
days. It requires no Cloudflare connection, cloud storage token, Worker secret,
or D1 access.

The private decryption identity never enters GitHub. Only its public `age1...`
recipient is entered when the workflow is run.

## 1. Create the encryption identity on a trusted computer

Install `age`, then run:

```sh
age-keygen -o hamvara-source-backup.agekey
age-keygen -y hamvara-source-backup.agekey
```

The first command creates the private identity. Store it in an offline encrypted
device and a password manager. Never paste it into GitHub, ChatGPT, source code,
an issue, or a workflow input.

The second command prints a public recipient beginning with `age1`. This public
value is safe to use as the workflow input.

## 2. Create the encrypted backup

1. Open **Actions** in `mazdaran/hamvara-site`.
2. Select **Create Encrypted Source Backup**.
3. Select **Run workflow** from `main`.
4. Enter `BACKUP-SOURCE` for the confirmation.
5. Paste only the public `age1...` recipient.
6. Run the workflow.

The job has read-only repository permission. It fetches branches and tags,
creates and verifies a Git bundle, places the bundle and its manifest in a tar
archive, encrypts that archive, and uploads the encrypted file plus its SHA-256
checksum as one GitHub Actions artifact.

It cannot deploy the Worker, migrate D1, alter Cloudflare, or read production
application secrets.

## 3. Download and test restoration

Download the artifact from the successful workflow run and extract its ZIP.
Verify the encrypted file before decrypting it:

```sh
sha256sum -c hamvara-site-*.bundle.tar.age.sha256
```

Decrypt and inspect the bundle on the trusted computer:

```sh
age --decrypt \
  --identity hamvara-source-backup.agekey \
  --output hamvara-site-backup.tar \
  hamvara-site-*.bundle.tar.age
mkdir hamvara-site-restore
tar -xf hamvara-site-backup.tar -C hamvara-site-restore
git bundle verify hamvara-site-restore/hamvara-site-*.bundle
git clone hamvara-site-restore/hamvara-site-*.bundle restored-repository
```

Compare the restored HEAD, branches, and tags with GitHub. Keep the private key
separate from the downloaded artifact.

## 4. Retention and limits

The artifact is retained for 90 days. Create a fresh backup after important
releases and at least monthly. This is the no-external-account first layer; it
does not replace a future second-provider or offline copy.

This source backup does not include GitHub Actions secrets, Cloudflare Worker
secrets, D1 data, R2 application objects, issues, pull requests, or release
assets. Those need separate recovery procedures.
