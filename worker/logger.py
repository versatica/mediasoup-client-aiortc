import logging
import sys

rootLogger = logging.getLogger()
rootLogger.addHandler(logging.StreamHandler(sys.stdout))
debugLogger = logging.Logger('')
debugLogger.addHandler(logging.StreamHandler(sys.stdout))
errorLogger = logging.Logger('')
errorLogger.addHandler(logging.StreamHandler(sys.stderr))

fileLogger = logging.Logger('')
fileLogger.addHandler(logging.FileHandler('/tmp/foo.log'))
fileLogger.setLevel(logging.DEBUG)
