"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

import type { Auth } from "firebase/auth";
import type { AuthError } from "firebase/auth";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
// Logo image import (public folder)
// The image should be placed at /public/logo.png or /public/logo.svg

export default function Home() {
  const router = useRouter();
  const [showLogin, setShowLogin] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [auth, setAuth] = useState<Auth | null>(null);
  const [isClient, setIsClient] = useState(false);


  // Initialize Firebase auth on client-side only
  useEffect(() => {
    const initFirebase = async () => {
      const { auth } = await import('@/lib/firebase');

      setAuth(auth);
      setIsClient(true);
    };
    
    initFirebase().catch(console.error);
  }, []);

  const handleGoogleLogin = async () => {
    if (!auth || !isClient) return;
    
    try {
      setLoginError(null);
      const { signInWithPopup } = await import('firebase/auth');
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setShowLogin(false);
      router.push("/design");
    } catch (error) {
      const errorCode = (error as AuthError)?.code;
      if (errorCode !== 'auth/popup-closed-by-user') {
        console.error("Error during login:", error);
      }
      if (errorCode === 'auth/unauthorized-domain') {
        setLoginError(
          "This domain is not authorized for authentication. Please add 'localhost' to the authorized domains in your Firebase console under Authentication > Settings > Authorized domains."
        );
      } else if (errorCode === 'auth/popup-blocked') {
        setLoginError("تم حظر النافذة المنبثقة. يرجى السماح بالنوافذ المنبثقة (Popups) لهذا الموقع من إعدادات المتصفح ثم حاول مرة أخرى.");
      } else if (errorCode === 'auth/popup-closed-by-user') {
        setLoginError("Login was cancelled. Please try again if you wish to proceed.");
      } else {
        setLoginError("An error occurred during login. Please try again.");
      }
    }
  };

  const featureVariants = {
    hidden: { opacity: 0, y: 40 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: 1 + i * 0.15, type: 'spring', stiffness: 60, damping: 18 }
    }),
    hover: { scale: 1.06, rotate: -2, boxShadow: "0 8px 32px 0 rgba(136,84,255,0.25)" }
  };
  const buttonVariants = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 60, damping: 18, delay: 0.6 } },
    hover: { scale: 1.08, boxShadow: "0 8px 32px 0 rgba(136,84,255,0.25)" },
    tap: { scale: 0.96 }
  };
  const modalVariants = {
    hidden: { opacity: 0, scale: 0.85 },
    visible: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 80, damping: 18 } },
    exit: { opacity: 0, scale: 0.85, transition: { duration: 0.3 } }
  };
  const errorVariants = {
    hidden: { opacity: 0, y: -20 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 60, damping: 18 } },
    exit: { opacity: 0, y: -20, transition: { duration: 0.3 } }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.7 }}
      className="min-h-screen flex flex-col justify-between bg-gradient-to-b from-[#181824] via-[#2d1a3a] to-[#7b2ff2] pt-24"
    >
      {/* Header with logo + animation */}
      <motion.header
        className="w-full fixed top-0 left-0 z-50 bg-transparent flex items-center justify-between h-24 px-12"
        style={{backdropFilter: 'blur(4px)'}}
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 60, damping: 18 }}
      >
        <div className="flex items-center">
          {/* Responsive logo: logo.png for desktop, logo-min.png for tablet/mobile */}
          <picture>
            <source srcSet="/logo-min.png" media="(max-width: 1023px)" />
            <motion.div
              initial={{ opacity: 0, scale: 0.85, rotate: -8 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 80, damping: 14 }}
            >
              <Image
                src="/logo.png"
                alt="Snappy AI Logo"
                width={150} // Adjust based on your logo's aspect ratio
                height={150} // Adjust based on your logo's aspect ratio
                style={{ height: '150px', width: 'auto', display: 'block' }}
                unoptimized // Use unoptimized for local assets or if you handle optimization externally
              />
            </motion.div>
          </picture>
        </div>
      </motion.header>
      {/* Main Content */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{}}
        className="flex flex-col items-center justify-center flex-1 px-4 pt-24 pb-12"
      >
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 60, damping: 18, delay: 0.2 }}
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-white text-center drop-shadow-[0_4px_24px_rgba(123,47,242,0.5)] leading-tight mb-6"
        >
          Build World-Class<br />Websites<br />From Any Design Image
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 60, damping: 18, delay: 0.4 }}
          className="text-lg sm:text-xl text-gray-200 text-center max-w-xl mb-8"
        >
          Instantly convert your design to clean, responsive code. No coding. No hassle. Just upload and go.
        </motion.p>
        <motion.button
          variants={buttonVariants}
          initial="hidden"
          animate="visible"
          whileHover="hover"
          whileTap="tap"
          className="px-10 py-3 rounded-xl bg-gradient-to-r from-pink-400 to-purple-500 text-white font-bold text-lg shadow-lg mb-16 button-animate"
          onClick={() => {
            if (auth && auth.currentUser) {
              router.push("/design");
            } else {
              setShowLogin(true);
            }
          }}
        >
          Get Started
        </motion.button>
      </motion.div>
      {/* Features */}
      <motion.ul
        initial="hidden"
        animate="visible"
        className="w-full flex flex-col md:flex-row justify-center items-center gap-6 pb-16 px-4"
        style={{ listStyle: 'none', padding: 0, margin: 0 }}
      >
        {[{
          title: "Lightning Fast",
          desc: "Get production-ready code in seconds, matching your design pixel by pixel."
        }, {
          title: "No Coding Needed",
          desc: "Just upload your design and download your ready-to-use website."
        }, {
          title: "Private & Secure",
          desc: "Your designs are processed securely and never shared."
        }].map((f, i) => (
          <motion.li
            key={f.title}
            custom={i}
            variants={featureVariants}
            initial="hidden"
            animate="visible"
            whileHover="hover"
            className="bg-white/10 backdrop-blur-md rounded-2xl shadow-xl p-6 w-full max-w-xs text-center border border-white/10 cursor-pointer"
          >
            <motion.h3 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1 + i * 0.1, type: 'spring', stiffness: 60, damping: 18 }} className="text-lg font-bold text-white mb-2">{f.title}</motion.h3>
            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2 + i * 0.1, type: 'spring', stiffness: 60, damping: 18 }} className="text-sm text-gray-200">{f.desc}</motion.p>
          </motion.li>
        ))}
      </motion.ul>
      <div style={{ marginBottom: '96px' }} />
      <motion.footer
        className="w-full text-center py-6 text-gray-300 text-sm bg-transparent mt-auto border-t border-white/10"
        style={{backdropFilter: 'blur(2px)'}}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, type: 'spring', stiffness: 60, damping: 18 }}
      >
        © {new Date().getFullYear()} Snappy AI. All rights reserved.
      </motion.footer>
      {/* Login Modal */}
      <AnimatePresence>
        {showLogin && (
          <motion.div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={modalVariants}
          >
            <motion.div
              className="bg-gradient-to-br from-[#2d1a3a]/90 to-[#181824]/90 backdrop-blur-md rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl border border-white/10"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ type: 'spring', stiffness: 80, damping: 18 }}
            >
              <motion.h2
                className="text-3xl font-bold mb-6 text-center text-white drop-shadow-[0_2px_8px_rgba(123,47,242,0.5)]"
                initial={{ opacity: 0, y: -30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 60, damping: 18 }}
              >
                Login to Continue
              </motion.h2>
              <AnimatePresence>
                {loginError && (
                  <motion.div
                    className="bg-red-500/20 backdrop-blur-sm border border-red-500/30 text-red-200 px-4 py-3 rounded-xl mb-6"
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    variants={errorVariants}
                  >
                    <p className="text-sm">{loginError}</p>
                  </motion.div>
                )}
              </AnimatePresence>
              <motion.button
                onClick={handleGoogleLogin}
                className="w-full px-6 py-3 bg-gradient-to-r from-pink-400 to-purple-500 text-white rounded-xl font-bold shadow-lg mb-4 button-animate"
                whileHover={{ scale: 1.05, boxShadow: "0 8px 32px 0 rgba(136,84,255,0.25)" }}
                whileTap={{ scale: 0.97 }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 60, damping: 18 }}
              >
                Login with Google
              </motion.button>
              <motion.button
                onClick={() => setShowLogin(false)}
                className="w-full mt-2 text-gray-300 hover:text-white transition-colors duration-200 font-medium"
                whileHover={{ scale: 1.04, color: '#fff' }}
                whileTap={{ scale: 0.97 }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, type: 'spring', stiffness: 60, damping: 18 }}
              >
                Cancel
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <style jsx global>{`
        .fade-in {
          opacity: 0;
          transform: translateY(40px);
          transition: opacity 0.7s cubic-bezier(.4,0,.2,1), transform 0.7s cubic-bezier(.4,0,.2,1);
        }
        .fade-in.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .slide-up {
          opacity: 0;
          transform: translateY(60px);
          transition: opacity 0.8s cubic-bezier(.4,0,.2,1), transform 0.8s cubic-bezier(.4,0,.2,1);
        }
        .slide-up.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .button-animate {
          transition: background 0.3s, box-shadow 0.3s, transform 0.2s;
        }
        .button-animate:hover {
          transform: scale(1.06) translateY(-2px);
          box-shadow: 0 8px 32px 0 rgba(136,84,255,0.25);
        }
      `}</style>
    </motion.div>
  );
}