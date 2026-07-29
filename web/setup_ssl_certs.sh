#!/usr/bin/env bash
set -eux

umask 077

mkdir -p /opt/ca /etc/ssl/private /etc/ssl/certs

openssl genrsa -out /opt/ca/internalCA.key 4096
openssl req -x509 -new -nodes -key /opt/ca/internalCA.key -sha256 -days 3650 \
    -subj "/CN=Internal CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,digitalSignature,keyCertSign,cRLSign" \
    -out /opt/ca/internalCA.crt

openssl genrsa -out /opt/ca/internal.key.pem 2048
openssl req -new -key /opt/ca/internal.key.pem -subj "/CN=cdn.internal" -out /opt/ca/internal.csr.pem

printf "subjectAltName=DNS:*.internal\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth" > /opt/ca/san.cnf
openssl x509 -req -in /opt/ca/internal.csr.pem \
    -CA /opt/ca/internalCA.crt -CAkey /opt/ca/internalCA.key -CAcreateserial \
    -out /etc/ssl/certs/internal.cert.pem -days 825 -sha256 \
    -extfile /opt/ca/san.cnf

cp /opt/ca/internal.key.pem /etc/ssl/private/internal.key.pem
cp /opt/ca/internalCA.crt /usr/local/share/ca-certificates/internalCA.crt

update-ca-certificates
cat /usr/local/share/ca-certificates/internalCA.crt >> "$(python3 -m certifi)"

rm -rf /opt/ca
