import paramiko

# Deploy script using SSH
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    client.connect('89.117.52.143', username='root', password='Z#yyJl7e34sptFij')
    print("SSH connected successfully")

    # Execute deploy script on server
    stdin, stdout, stderr = client.exec_command('cd /var/www/test && chmod +x ./scripts/deploy_test.sh && ./scripts/deploy_test.sh')
    
    # Print output
    output = stdout.read().decode()
    error = stderr.read().decode()
    
    if output:
        print("STDOUT:")
        print(output)
    if error:
        print("STDERR:")
        print(error)
    
    print("Deploy completed!")

except Exception as e:
    print(f"Error: {e}")

finally:
    client.close()
