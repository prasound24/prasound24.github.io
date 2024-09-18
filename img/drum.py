import scipy.special as sp
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.colors as mc

def f(x, y, m = 3, n = 2):
   xy = x+y*1j
   nth_zero = sp.jn_zeros(m, n)[-1]
   drum = np.sin(m*np.angle(xy)) * sp.jn(m, np.abs(xy)*nth_zero)
   return (np.abs(xy) < 1.) * (0.1 < np.abs(drum))

n = 256
x = np.linspace(-1, 1, n)
y = np.linspace(-1, 1, n)
xx, yy = np.meshgrid(x, y)
zz = f(xx, yy)

colors = [(1, 1, 1, alpha) for alpha in np.linspace(0, 1, n)]
plt.imsave('drum.png', zz, cmap=mc.ListedColormap(colors))
