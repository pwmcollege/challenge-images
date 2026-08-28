import os

wsgi_app = "wsgi:application"
bind = "0.0.0.0:80"

workers = 1
worker_class = "gthread"
threads = min(16, max(4, len(os.sched_getaffinity(0)) * 2))
preload_app = True

user = 0
group = 0
umask = 0o077

loglevel = "info"
accesslog = "/var/log/gunicorn/access.log"
errorlog = "/var/log/gunicorn/error.log"
capture_output = True
