#!/bin/bash
sudo apt update
# Check if postgresql is installed
which psql > /dev/null 2>&1
if [[ $? -ne 0 ]]; then
  echo "PostgreSQL is not installed. Installing now..."
  sudo apt install -y postgresql postgresql-contrib
else
  echo "PostgreSQL is already installed."
fi

# Check if PostGIS is installed
dpkg -s postgis > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "PostGIS is already installed."
else
  echo "PostGIS is not installed. Installing now..."
  sudo apt install -y postgis
  echo "PostGIS installation completed."
fi

# Switch to postgres user to setup database and user
sudo -u postgres -l bash -c "psql -c \"SELECT 1 FROM pg_roles WHERE rolename='admin';\"" | grep -q 1
if [ $? -ne 0 ]; then
  echo "Admin user does not exist. Creating now..."
  sudo -u postgres -l bash -c "psql -c \"CREATE USER admin WITH PASSWORD 'admin';\""
else
  echo "Admin user already exists."
fi

# Check if property database exists
sudo -u postgres -l bash -c "psql -lqt | cut -d \| -f 1 | grep -qw property"
if [ $? -ne 0 ]; then
  echo "Property database does not exist. Creating now..."
  sudo -u postgres -l bash -c "psql -c \"CREATE DATABASE property;\""
  sudo -u postgres -l bash -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE property TO admin;\""
else
  echo "Property database already exists."
fi

echo "Script finished."
