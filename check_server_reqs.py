
import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    client.connect('89.117.52.143', username='root', password='Z#yyJl7e34sptFij')
    print("Checking /var/www/beta...")
    print("Executing force reset and deploy on /var/www/beta...")
    commands = [
        'cd /var/www/beta',
        'git fetch origin',
        'git reset --hard origin/main',
        'chmod +x ./scripts/deploy_test.sh',
        './scripts/deploy_test.sh main'
    ]
    stdin, stdout, stderr = client.exec_command(' && '.join(commands))
    
    output = stdout.read().decode()
    error = stderr.read().decode()
    
    if output:
        print("STDOUT:", output)
    if error:
        print("STDERR:", error)
finally:
    client.close()
